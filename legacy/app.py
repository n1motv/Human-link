# ┌─────────────────────────────────────────────────────────────┐
# │     [C'EST PARTI] ON VA TOUT CHARGER ET FAIRE DES MIRACLES │
# └─────────────────────────────────────────────────────────────┘

import os
import random
import re
import string
import sqlite3
from hashlib import md5
from datetime import datetime, timedelta

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from dotenv import load_dotenv
from flask import Flask, flash, jsonify, redirect, render_template, request, session, url_for
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_mail import Mail

from db_setup import (
    cree_compte_admin,
    cree_table_arrets_maladie,
    cree_table_conges,
    cree_table_managers,
    cree_table_notifications,
    cree_table_prime,
    cree_table_réponse_réunion,
    cree_table_réunion,
    cree_table_teletravail,
    cree_table_utilisateurs,
    cree_table_demandes_contact,
    connect_db,
    encrypt_db,
    decrypt_db,
    cree_table_feedback
)
from forms import LoginForm
from s3_utils import upload_file_to_s3 , generate_presigned_url , delete_file_from_s3 , list_files_in_s3

ph = PasswordHasher()
load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY')
app.config['SESSION_PERMANENT'] = False
app.config['TEMPLATES_AUTO_RELOAD'] = True
app.config['DEBUG'] = True

# [DES LOGS, RIEN QUE DES LOGS, POUR LE FUN ET LA GLOIRE]
LOG_DIR = "logs"
os.makedirs(LOG_DIR, exist_ok=True)

# [ON BALANCE DU COURRIEL SINON ÇA SERAIT TROP SIMPLE]
app.config['MAIL_SERVER'] = 'smtp.gmail.com'
app.config['MAIL_PORT'] = 587
app.config['MAIL_USE_TLS'] = True
app.config['MAIL_USERNAME'] = os.getenv('MAIL_USERNAME')
app.config['MAIL_PASSWORD'] = os.getenv('MAIL_PASSWORD')
app.config['LLM_API_URL'] = os.getenv('LLM_API_URL')
app.config['MODEL_NAME'] = os.getenv('MODEL_NAME')

api_url = app.config['LLM_API_URL']
model_name = app.config['MODEL_NAME']
admin_email = app.config['MAIL_USERNAME']

# [ON SURVEILLE LES PETITS MALINS QUI SPAMMENT]
limiter = Limiter(
    key_func=get_remote_address,
    app=app,
    default_limits=["10 per minute"]
)

# [CHECK DES UPLOADS, PARCE QU'ON AIME SAVOIR QUI TRIMBALE QUOI]
ALLOWED_EXTENSIONS = {'pdf', 'png', 'jpg', 'jpeg', 'gif'}
BASE_COFFRE_FORT = "static/coffre_fort/"
ALLOWED_EXTENSIONS_DOCUMENTS = {'pdf'}

mail = Mail(app)

from helpers import *

# ┌─────────────────────────────────────────────────────────────┐
# │   [C'EST L'HEURE DE TOUT FAIRE PÉTER] CRÉER LES TABLES ETC. │
# └─────────────────────────────────────────────────────────────┘

def initialiser_base_de_donnees():
    """
    Crée tout ce qui est nécessaire : tables, admin, congés mensuels.
    """
    cree_table_utilisateurs()
    cree_table_arrets_maladie()
    cree_compte_admin()
    cree_table_conges()
    cree_table_managers()
    cree_table_prime()
    ajouter_conge_mensuel()
    cree_table_réunion()
    cree_table_réponse_réunion()
    cree_table_teletravail()
    cree_table_demandes_contact()
    cree_table_notifications()
    cree_table_feedback()

@app.template_filter('format_datetime')
def format_datetime(value, format='%d-%m-%Y %H:%M'):
    """
    Joli formatage d'une date, c'est plus sympa que tout collé.
    """
    if isinstance(value, datetime):
        return value.strftime(format)
    try:
        value = datetime.strptime(value, '%Y-%m-%d %H:%M:%S')
        return value.strftime(format)
    except Exception:
        return value

# ┌─────────────────────────────────────────────────────────────┐
# │    [ROUTES GÉNÉRALES POUR LE PEUPLE, OUVERT À TOUT LE MONDE] │
# └─────────────────────────────────────────────────────────────┘

@app.route("/")
def charging():
    """
    On va direct sur /login, la page illusions de "loading".
    """
    return render_template('loading.html', redirect_url=url_for('login'))

@app.errorhandler(429)
def ratelimit_exceeded(e):
    flash("⚠️ Trop de tentatives ! Essayez à nouveau dans une minute.", "danger")
    return redirect(url_for("login"))

@app.route("/login", methods=["GET", "POST"])
def login():
    """
    Pour se connecter. 4 tentatives max, après c'est 24h de purgatoire.
    """
    form = LoginForm()

    if form.validate_on_submit():
        email = form.email.data
        mot_de_passe = form.mot_de_passe.data
        connexion = connect_db()
        curseur = connexion.cursor()

        curseur.execute("""
            SELECT id, email, mot_de_passe, role, tentative_echouee, bloque_jusqu_a ,photo
            FROM utilisateurs WHERE email = ?
        """, (email,))
        utilisateur = curseur.fetchone()

        if utilisateur:
            user_id, user_email, hashed_password, role, tentative_echouee, bloque_jusqu_a , photo = utilisateur

            if bloque_jusqu_a and datetime.strptime(bloque_jusqu_a, "%Y-%m-%d %H:%M:%S") > datetime.now():
                flash(" Votre compte est bloqué pour 24h. Contactez l`administrateur ou attendez l`email de récupération.", "danger")
                connexion.close()
                return render_template("login.html", form=form)

            try:
                if ph.verify(hashed_password, mot_de_passe):
                    curseur.execute("UPDATE utilisateurs SET tentative_echouee = 0, bloque_jusqu_a = NULL WHERE email = ?", (email,))
                    connexion.commit()

                    session["email"] = user_email
                    session["id"] = user_id
                    session["role"] = role
                    session["photo"] = photo

                    redirect_url_map = {
                        "admin": "admin_dashboard",
                        "manager": "manager_dashboard"
                    }
                    redirect_url_name = redirect_url_map.get(role, "voir_mes_infos")

                    connexion.close()
                    return render_template("loading.html", redirect_url=url_for(redirect_url_name))

            except VerifyMismatchError:
                tentative_echouee += 1
                if tentative_echouee >= 4:
                    bloque_jusqu_a = (datetime.now() + timedelta(hours=24)).strftime("%Y-%m-%d %H:%M:%S")
                    curseur.execute("""
                        UPDATE utilisateurs 
                        SET tentative_echouee = ?, bloque_jusqu_a = ? 
                        WHERE email = ?
                    """, (tentative_echouee, bloque_jusqu_a, email))
                    connexion.commit()

                    token = serializer.dumps(email, salt="update_password")
                    lien_reinitialisation = f"http://127.0.0.1:5000/update_password?token={token}"
                    envoyer_email("Réinitialisation de votre mot de passe", email , f"Votre compte est bloqué pour 24 heures.\nVous pouvez réinitialiser votre mot de passe via ce lien : {lien_reinitialisation}")
                    flash(" Votre compte est bloqué pour 24h. Vous recevrez un email pour le réinitialiser.", "danger")
                else:
                    curseur.execute("UPDATE utilisateurs SET tentative_echouee = ? WHERE email = ?", (tentative_echouee, email))
                    connexion.commit()
                    flash(f"❌ Mot de passe incorrect. Tentative {tentative_echouee}/4", "warning")

        else:
            flash("Aucun compte trouvé avec cet email.", "danger")

        connexion.close()

    return render_template("login.html", form=form)

@app.route("/logout")
def logout():
    """
    Petite éjection de la session, byebye.
    """
    session.clear()
    return render_template('loading.html', redirect_url=url_for('login'))

@app.route('/contact', methods=['GET', 'POST'])
def contact():
    """
    Envoyez-nous un message d'amour, ou de haine... On lit tout.
    """
    if request.method == 'POST':
        nom = request.form.get('nom')
        prenom = request.form.get('prenom')
        email = request.form.get('email')
        telephone = request.form.get('telephone')
        sujet = request.form.get('sujet')
        message = request.form.get('message')
        id_utilisateur = request.form.get('id')

        if 'id' in session:
            id_utilisateur = session['id']
            email = session['email']
            connexion = connect_db()
            cur = connexion.cursor()
            cur.execute("SELECT nom, prenom, telephone FROM utilisateurs WHERE id = ? ", (id_utilisateur,))
            user_info = cur.fetchone()
            if user_info:
                nom, prenom, telephone = user_info
            connexion.close()

        connexion = connect_db()
        cur = connexion.cursor()
        cur.execute("""
            INSERT INTO demandes_contact (id_utilisateur, nom, prenom, email, sujet, message, telephone)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (id_utilisateur, nom, prenom, email, sujet, message, telephone))
        connexion.commit()
        connexion.close()

        contenu = "Bonjour,\n\nVous venez de recevoir une demande de contact.\n\nCordialement,"
        creer_notification(admin_email, contenu, f"Demande de contact")

        flash("Votre demande a été envoyée avec succès.", "success")
        return redirect(url_for('contact'))

    if 'email' in session:
        email = session['email']
        notifications = récupérer_notifications(email)
        nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(email)
        marquer_notifications_comme_lues(email)
        return render_template(
            'contact.html',
            notifications=notifications,
            nombre_notifications_non_lues=nombre_notifications_non_lues,
            photo=session.get('photo')
        )
    else:
        return render_template('contact.html')

@app.route('/reset_password', methods=["GET", "POST"])
def reset_password():
    """
    En cas de trou noir dans votre mémoire, on vous sauve.
    """
    return render_template('récupération_mot_de_passe.html')

@app.route('/envoyer_email_reinitialisation', methods=["GET", "POST"])
def envoyer_email_reinitialisation():
    """
    On balance un lien de réinitialisation au pauvre égaré qui a tout oublié.
    """
    if request.method == "GET":
        email = request.args.get('email')
    else:
        email = request.json.get('email')

    if not email:
        return jsonify({'success': False, 'error': 'Email non fourni'}), 400

    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("SELECT id FROM utilisateurs WHERE email = ?", (email,))
    utilisateur = cur.fetchone()
    connexion.close()

    if not utilisateur:
        return jsonify({'success': False, 'error': 'Email non trouvé'}), 404

    token = serializer.dumps(email, salt="update_password")
    lien_reinitialisation = f"http://127.0.0.1:5000/update_password?token={token}"
    
    sujet = "Réinitialisation de votre mot de passe"
    contenu = f"""Bonjour,

    Cliquez sur le lien suivant pour réinitialiser votre mot de passe :
    {lien_reinitialisation}

    Ce lien expirera dans 30 minutes.

    Cordialement,
    L'équipe RH.
    """
    try:
        envoyer_email(sujet, email, contenu)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/update_password', methods=['GET', 'POST'])
def update_password():
    """
    On utilise un token magique, pouf nouveau pass.
    """
    token = request.args.get('token')
    try:
        email = serializer.loads(token, salt="update_password", max_age=1800)
    except Exception:
        flash("Le lien de réinitialisation est invalide ou expiré.", "danger")
        return redirect(url_for('reset_password'))

    if request.method == 'POST':
        new_password = request.form['new_password']
        hashed_password = ph.hash(new_password)

        connexion = connect_db()
        cur = connexion.cursor()
        cur.execute("""
            UPDATE utilisateurs
            SET mot_de_passe = ?, tentative_echouee = 0, bloque_jusqu_a = NULL
            WHERE email = ?
        """, (hashed_password, email))
        connexion.commit()
        connexion.close()

        flash('Votre mot de passe a été mis à jour avec succès. Vous pouvez à présent vous connecter immédiatement.', 'success')
        return redirect(url_for('login'))

    return render_template('modifié_mot_de_passe.html', email=email)

@app.route('/mark_notifications_as_read', methods=['POST'])
def mark_notifications_as_read():
    """
    On met toutes les notifs en 'lues' pour l'user.
    """
    if 'email' not in session:
        flash("Vous devez être connecté pour accéder à cette page.")
        return jsonify({'error': 'Unauthorized'}), 401

    email = session['email']
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        UPDATE notifications
        SET is_read = 1
        WHERE email = ? AND is_read = 0
    """, (email,))
    connexion.commit()
    connexion.close()
    return jsonify({'success': True})

@app.route('/supprimer_notification/<int:id>', methods=['POST'])
def supprimer_notification(id):
    """
    Pouf, la notif ciblée disparait.
    """
    try:
        connexion = connect_db()
        cur = connexion.cursor()
        cur.execute("DELETE FROM notifications WHERE id = ?", (id,))
        connexion.commit()
        connexion.close()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/get_new_notifications')
def get_new_notifications():
    """
    Permet d'avoir les notifs fraiches comme le pain du matin.
    """
    email = session.get('email')
    if not email:
        return jsonify({'new_notifications': [], 'unread_count': 0})

    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("SELECT id, message, created_at FROM notifications WHERE email = ? AND is_read = 0", (email,))
    notifications = cur.fetchall()
    connexion.close()

    return jsonify({'new_notifications': notifications, 'unread_count': len(notifications)})

@app.route("/calendrier_congés")
def calendrier_congés():
    """
    Calendrier plein de couleurs, on y voit nos congés acceptés.
    """
    if 'role' not in session or session['role'] not in ['admin', 'manager']:
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))

    connexion = connect_db()
    cur = connexion.cursor()

    if session['role'] == 'admin':
        notifications = récupérer_notifications(admin_email)
        nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(admin_email)
        marquer_notifications_comme_lues(admin_email)
        cur.execute("""
            SELECT dc.id_utilisateurs, dc.date_debut, dc.date_fin, dc.description, u.nom, u.prenom, u.email 
            FROM demandes_congé dc
            JOIN utilisateurs u ON dc.id_utilisateurs = u.id
            WHERE dc.statut = 'accepte'
        """)

    elif session['role'] == 'manager':
        manager_id = session['id']
        cur.execute("SELECT email FROM utilisateurs WHERE id=?",(manager_id,))
        manager_email=cur.fetchone()[0]
        notifications = récupérer_notifications(manager_email)
        nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(manager_email)
        marquer_notifications_comme_lues(manager_email)
        cur.execute("""
            SELECT dc.id_utilisateurs, dc.date_debut, dc.date_fin, dc.description, u.nom, u.prenom, u.email 
            FROM demandes_congé dc
            JOIN utilisateurs u ON dc.id_utilisateurs = u.id
            JOIN managers m ON m.id_supervise = dc.id_utilisateurs
            WHERE dc.statut = 'accepte' AND m.id_manager = ?
        """, (manager_id,))

    conges_acceptes = cur.fetchall()
    connexion.close()

    conges_par_jour = {}
    couleurs_employes = {}

    for conge in conges_acceptes:
        id_utilisateur, date_debut, date_fin, description, nom, prenom, email = conge
        if email not in couleurs_employes:
            couleurs_employes[email] = generer_couleur_employe(email)
        couleur = couleurs_employes[email]

        employe = {
            'id_utilisateur': id_utilisateur,
            'nom': nom,
            'prenom': prenom,
            'email': email,
            'description': description,
            'statut': 'accepte',
            'color': couleur
        }

        date_debut = datetime.strptime(date_debut, '%Y-%m-%d')
        date_fin = datetime.strptime(date_fin, '%Y-%m-%d')
        for single_date in (date_debut + timedelta(n) for n in range((date_fin - date_debut).days + 1)):
            if single_date not in conges_par_jour:
                conges_par_jour[single_date] = []
            conges_par_jour[single_date].append(employe)

    return render_template(
        "calendrier_congés.html",
        conges_par_jour=conges_par_jour,
        role=session['role'],
        notifications=notifications,
        nombre_notifications_non_lues=nombre_notifications_non_lues,
        photo=session.get('photo')
    )

@app.route('/calendrier_teletravail')
def calendrier_teletravail():
    """
    Un autre calendrier qui affiche le télétravail. C'est la fête !
    """
    if 'role' not in session or session['role'] not in ['admin', 'manager']:
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))
    connexion = connect_db()
    cur = connexion.cursor()

    if session['role'] == 'admin':
        notifications = récupérer_notifications(admin_email)
        nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(admin_email)
        marquer_notifications_comme_lues(admin_email)
        cur.execute("""
            SELECT t.id_employe, t.date_teletravail, u.nom, u.prenom, u.email 
            FROM teletravail t
            JOIN utilisateurs u ON t.id_employe = u.id
        """)
    else:
        manager_id = session['id']
        cur.execute("SELECT email FROM utilisateurs WHERE id=?", (manager_id,))
        manager_email = cur.fetchone()[0]
        notifications = récupérer_notifications(manager_email)
        nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(manager_email)
        marquer_notifications_comme_lues(manager_email)
        cur.execute("""
            SELECT t.id_employe, t.date_teletravail, u.nom, u.prenom, u.email 
            FROM teletravail t
            JOIN utilisateurs u ON t.id_employe = u.id
            JOIN managers m ON m.id_supervise = t.id_employe
            WHERE m.id_manager = ?
        """, (manager_id,))

    teletravail_data = cur.fetchall()
    connexion.close()

    teletravail_par_jour = {}
    couleurs_employes = {}

    for teletravail in teletravail_data:
        id_employe, date_teletravail, nom, prenom, email = teletravail
        if email not in couleurs_employes:
            couleurs_employes[email] = generer_couleur_employe(email)

        employe = {
            'id_employe': id_employe,
            'nom': nom,
            'prenom': prenom,
            'email': email,
            'color': couleurs_employes[email]
        }

        date_obj = datetime.strptime(date_teletravail, '%Y-%m-%d')
        if date_obj not in teletravail_par_jour:
            teletravail_par_jour[date_obj] = []
        teletravail_par_jour[date_obj].append(employe)

    return render_template(
        "calendrier_télétravail.html",
        teletravail_par_jour=teletravail_par_jour,
        role=session['role'],
        notifications=notifications,
        nombre_notifications_non_lues=nombre_notifications_non_lues,
        photo=session.get('photo')
    )

@app.route('/supprimer_elements/<string:table>', methods=['POST'])
def supprimer_elements(table):
    """
    On supprime un paquet d'éléments dans une table, 
    en vérifiant si le manager/admin en a le droit. 
    Sinon c'est refusé, la vie est dure.
    """
    if 'id' not in session:
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))
    
    user_id = session['id']
    user_role = get_user_role(user_id)
    if not user_role:
        flash("Rôle utilisateur inconnu.")
        return jsonify({'success': False, 'message': "Rôle utilisateur inconnu."}), 403

    data = request.get_json()
    ids = data.get('ids', [])
    if not ids:
        return jsonify({'success': False, 'message': "Aucun élément sélectionné."}), 400

    tables_autorisees = {
        'demandes_arrêt': 'employe_email',
        'demandes_congé': 'id_utilisateurs',
        'demandes_prime': 'id_employe',
        'demandes_contact': 'id_utilisateur',
        'réunion': 'created_by'
    }

    if table not in tables_autorisees:
        return jsonify({'success': False, 'message': "Table non autorisée."}), 400

    colonne_appartenance = tables_autorisees[table]

    connexion = connect_db()
    curseur = connexion.cursor()

    placeholders = ','.join(['?'] * len(ids))
    query = f"SELECT {colonne_appartenance} FROM {table} WHERE id IN ({placeholders})"
    curseur.execute(query, ids)
    rows = curseur.fetchall()
    connexion.close()

    if not rows:
        return jsonify({'success': False, 'message': "Aucun élément trouvé pour les IDs fournis."}), 404

    ids_autorises = []
    if user_role == 'admin':
        ids_autorises = ids
    elif user_role == 'manager':
        managed_employees = get_managed_employees(user_id)
        for idx, row in zip(ids, rows):
            if colonne_appartenance == 'employe_email':
                employe_id = get_user_id_by_email(row[colonne_appartenance])
                if employe_id in managed_employees or employe_id == user_id:
                    ids_autorises.append(idx)
            else:
                owner_id = row[colonne_appartenance]
                if owner_id in managed_employees or owner_id == user_id:
                    ids_autorises.append(idx)
    else:
        for idx, row in zip(ids, rows):
            if colonne_appartenance == 'employe_email':
                employe_id = get_user_id_by_email(row[colonne_appartenance])
                if employe_id == user_id:
                    ids_autorises.append(idx)
            else:
                owner_id = row[colonne_appartenance]
                if owner_id == user_id:
                    ids_autorises.append(idx)

    if not ids_autorises:
        return jsonify({'success': False, 'message': "Vous n'avez pas les permissions pour supprimer les éléments sélectionnés."}), 403

    try:
        connexion = connect_db()
        curseur = connexion.cursor()
        placeholders_autorises = ','.join(['?'] * len(ids_autorises))
        delete_query = f"DELETE FROM {table} WHERE id IN ({placeholders_autorises})"
        curseur.execute(delete_query, ids_autorises)
        connexion.commit()
        connexion.close()

        return jsonify({'success': True, 'message': f"Les éléments sélectionnés ont été supprimés avec succès."}), 200
    except Exception as e:
        print(f"Erreur lors de la suppression : {e}")
        return jsonify({'success': False, 'message': "Une erreur est survenue lors de la suppression des éléments."}), 500


# ┌─────────────────────────────────────────────────────────────┐
# │ [LES ROUTES D'ADMINISTRATEUR, DÉSOLÉ C'EST ULTRA LONG]      │
# └─────────────────────────────────────────────────────────────┘

@app.route('/admin_dashboard')
def admin_dashboard():
    """
    Admin: gros scoreboard, stats, c'est la grande classe.
    """
    if 'role' not in session or session['role'] != 'admin':
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))

    connexion = connect_db()
    cur = connexion.cursor()

    cur.execute("""SELECT COUNT(*) FROM utilisateurs WHERE email != ?""",(admin_email,))
    total_employes = cur.fetchone()[0]

    cur.execute("""SELECT COUNT(DISTINCT(departement)) FROM utilisateurs WHERE email != ?""",(admin_email,))
    total_departements = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM demandes_congé WHERE statut = 'accepte'")
    conges_acceptes = cur.fetchone()[0]

    cur.execute("""SELECT AVG(salaire) FROM utilisateurs WHERE email != ?""",(admin_email,))
    result = cur.fetchone()[0]
    salaire_moyen = round(result, 2) if result is not None else 0.00

    cur.execute("""
        SELECT strftime('%m', date_debut) AS mois, COUNT(*) 
        FROM demandes_congé 
        WHERE statut = 'accepte' 
        GROUP BY mois
    """)
    conges_par_mois_data = cur.fetchall()
    mois_labels = [row[0] for row in conges_par_mois_data]
    conges_par_mois = [row[1] for row in conges_par_mois_data]

    today = datetime.now().strftime('%Y-%m-%d')
    cur.execute("""
        SELECT COUNT(*) FROM utilisateurs u
        WHERE email != ? 
        AND u.id NOT IN (
            SELECT t.id_employe FROM teletravail t WHERE t.date_teletravail = ?
        ) 
    """, (admin_email,today,))
    personnes_sur_site = cur.fetchone()[0]

    cur.execute("""SELECT COUNT(*) FROM teletravail WHERE date_teletravail = ?""", (today,))
    personnes_teletravail = cur.fetchone()[0]

    cur.execute("""
        SELECT date_debut, COUNT(*) 
        FROM demandes_congé 
        WHERE statut = 'accepte' 
        GROUP BY date_debut 
        ORDER BY date_debut
    """)
    conges_par_jour_data = cur.fetchall()
    jours_labels = [row[0] for row in conges_par_jour_data]
    conges_par_jour = [row[1] for row in conges_par_jour_data]

    cur.execute("""
        SELECT departement, COUNT(*) 
        FROM utilisateurs 
        WHERE email != ?
        GROUP BY departement
    """,(admin_email,))
    employes_par_departement_data = cur.fetchall()
    departement_labels = [row[0] for row in employes_par_departement_data]
    employes_par_departement = [row[1] for row in employes_par_departement_data]

    connexion.close()

    notifications = récupérer_notifications(admin_email)
    nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(admin_email)
    marquer_notifications_comme_lues(admin_email)

    return render_template(
        'admin_dashboard.html',
        total_employes=total_employes,
        total_departements=total_departements,
        conges_acceptes=conges_acceptes,
        salaire_moyen=salaire_moyen,
        mois_labels=mois_labels,
        conges_par_mois=conges_par_mois,
        jours_labels=jours_labels,
        conges_par_jour=conges_par_jour,
        departement_labels=departement_labels,
        employes_par_departement=employes_par_departement,
        notifications=notifications,
        nombre_notifications_non_lues=nombre_notifications_non_lues,
        personnes_sur_site=personnes_sur_site,
        personnes_teletravail=personnes_teletravail,
        photo=session.get('photo')
    )

@app.route("/afficher_employers")
def afficher_employés():
    """
    Admin : liste de tous les braves gens.
    """
    if 'role' not in session or session['role'] != 'admin':
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))

    connexion = connect_db()
    connexion.row_factory = None
    curseur = connexion.cursor()
    curseur.execute("""
        SELECT nom, prenom, date_naissance, poste, departement, email, solde_congé, salaire,
               id, role, photo, sexualite, telephone, adresse, ville, code_postal, pays,
               nationalite, numero_securite_sociale, date_embauche, type_contrat
        FROM utilisateurs
        WHERE id != "None"
        ORDER BY id
    """)
    employees= curseur.fetchall()
    
    notifications = récupérer_notifications(admin_email)
    nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(admin_email)
    marquer_notifications_comme_lues(admin_email)
    return render_template(
        "admin_employés.html",
        employees=employees,
        role=session.get('role'),
        notifications=notifications,
        nombre_notifications_non_lues=nombre_notifications_non_lues,
        photo=session.get('photo')
    )

@app.context_processor
def utility_processor():
    """
    Un petit cadeau pour Jinja, generate_presigned_url
    """
    return dict(generate_presigned_url=generate_presigned_url)

@app.route("/ajouter_employe", methods=["GET", "POST"])
def ajouter_employe_page():
    """
    Admin : rajoute un nouveau venu à la grande famille !
    """
    if 'role' not in session or (session['role'] != 'admin'):
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))

    erreur = None
    connexion = connect_db()
    curseur=connexion.cursor()
    if request.method == "POST":
        email = request.form['email']
        if email_existe(email):
            erreur = "Cet email est déjà assigné à un autre employé."
        else:
            date_naissance = request.form['date_naissance']
            if date_naissance:
                today = datetime.today()
                date_naissance_dt = datetime.strptime(date_naissance, "%Y-%m-%d")
                age = today.year - date_naissance_dt.year - ((today.month, today.day) < (date_naissance_dt.month, date_naissance_dt.day))
                if age < 17:
                    flash("L`employé doit avoir au moins 17 ans pour être enregistré.", "warning")
                    return redirect(url_for('ajouter_employe_page'))

            nom = request.form['nom']
            prenom = request.form['prenom']
            poste = request.form['poste']
            departement = request.form['departement']
            telephone = request.form['telephone']
            adresse = request.form['adresse']
            ville = request.form['ville']
            code_postal = request.form['code_postal']
            pays = request.form['pays']
            nationalite = request.form['nationalite']
            numero_securite_sociale = request.form['numero_securite_sociale']
            date_embauche = request.form['date_embauche']
            type_contrat = request.form['type_contrat']
            sexualite = request.form['sexualite']
            solde_congé = float(request.form['solde_congé']) if request.form['solde_congé'] else 0.0
            salaire = float(request.form['salaire']) if request.form['salaire'] else 0.0
            role = request.form['role']
            mot_de_passe = generer_mot_de_passe()
            mot_de_passe_hash = ph.hash(mot_de_passe)
            id_employe = generer_id()
            while id_existe(id_employe):
                id_employe = generer_id()

            file = request.files['photo']
            if file and allowed_file(file.filename):
                s3_key = upload_file_to_s3(file, file.filename, folder="photo_profile")
                file_name_only = s3_key
            else:
                file_name_only = 'default.png'

            curseur.execute("""
                    INSERT INTO utilisateurs (id, nom, prenom, date_naissance, poste, departement, email, mot_de_passe,
                                              solde_congé, salaire, role, photo, sexualite, telephone, adresse,
                                              ville, code_postal, pays, nationalite, numero_securite_sociale,
                                              date_embauche, type_contrat)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (id_employe, nom, prenom, date_naissance, poste, departement, email, mot_de_passe_hash,
                      solde_congé, salaire, role, file_name_only, sexualite, telephone, adresse,
                      ville, code_postal, pays, nationalite, numero_securite_sociale,
                      date_embauche, type_contrat))
            connexion.commit()
            connexion.close()

            sujet_felicitations = "Bienvenue chez notre entreprise !"
            contenu_felicitations = f"""
            Bonjour {prenom} {nom},

            Félicitations pour votre intégration au sein de notre entreprise. Nous sommes ravis de vous accueillir dans notre équipe.

            Cordialement,
            L'équipe RH
            """
            envoyer_email(sujet_felicitations, email, contenu_felicitations)

            sujet_mot_de_passe = "Votre compte a été créé avec succès"
            contenu_mot_de_passe = f"""
            Bonjour {prenom} {nom},

            Votre compte a été créé avec succès. Voici vos informations de connexion :
            Email : {email}
            Mot de passe temporaire : {mot_de_passe}

            Nous vous recommandons de changer ce mot de passe dès que possible via notre portail RH.

            Cordialement,
            L'équipe RH
            """
            envoyer_email(sujet_mot_de_passe, email, contenu_mot_de_passe)
            flash("L`employé a été ajouter avec succès","success")
            return redirect(url_for('afficher_employés'))

    notifications = récupérer_notifications(admin_email)
    nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(admin_email)
    marquer_notifications_comme_lues(admin_email)

    return render_template(
        "admin_ajouter_employe.html",
        erreur=erreur,
        notifications=notifications,
        nombre_notifications_non_lues=nombre_notifications_non_lues,
        photo=session.get('photo')
    )

@app.route('/akaTest/<string:ps>')
def akaTest(ps):
    """
    Hyperspace route pour hasher un pass, juste pour debug.
    """
    if 'role' not in session or session['role'] != "admin":
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))
    mot_de_passe_hash = ph.hash(ps)
    connexion = connect_db()
    curseur = connexion.cursor()
    curseur.execute("""UPDATE utilisateurs
                SET mot_de_passe = ?
                WHERE email = ?""",(mot_de_passe_hash,admin_email))
    connexion.commit()
    connexion.close()
    return redirect(url_for('login'))

@app.route("/afficher_demandes_congé")
def afficher_demandes_congé():
    """
    Affiche toutes les demandes de congé, version multi-rôles.
    """
    if 'role' not in session or session['role'] not in ['admin', 'manager']:
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))

    connexion = connect_db()
    curseur = connexion.cursor()

    if session['role'] == 'admin':
        curseur.execute("""
            SELECT * FROM demandes_congé
            WHERE statut_manager = 'accepte'
        """)
        demandes = curseur.fetchall()
        notifications = récupérer_notifications(admin_email)
        nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(admin_email)
        marquer_notifications_comme_lues(admin_email)
        return render_template(
            "admin_congés.html",
            demandes=demandes,
            notifications=notifications,
            nombre_notifications_non_lues=nombre_notifications_non_lues,
            photo=session.get('photo')
        )

    elif session['role'] == 'manager':
        manager_id = session['id']
        manager_email = session['email']
        curseur.execute("""
            SELECT dc.*
            FROM demandes_congé dc
            JOIN managers m ON dc.id_utilisateurs = m.id_supervise
            WHERE m.id_manager = ? AND statut_manager IN ('en attente', 'accepte', 'refuse')
        """, (manager_id,))
        demandes = curseur.fetchall()

        notifications = récupérer_notifications(manager_email)
        nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(manager_email)
        marquer_notifications_comme_lues(manager_email)

        return render_template(
            "manager_congés.html",
            demandes=demandes,
            notifications=notifications,
            nombre_notifications_non_lues=nombre_notifications_non_lues,
            photo=session.get('photo')
        )
    else:
        return redirect(url_for('login'))

@app.route("/repondre_conge/<int:id>", methods=["POST"])
def répondre_congés(id):
    """
    Manager ou admin répondent (accepte/refuse). 
    Notifs + tout ce bazar.
    """
    if 'role' not in session or session['role'] not in ['admin', 'manager']:
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))
    statut = request.form['statut']
    motif_refus = request.form.get('motif_refus', None)
    notifications = []

    connexion = connect_db()
    curseur = connexion.cursor()

    try:
        curseur.execute("SELECT * FROM demandes_congé WHERE id = ?", (id,))
        demande = curseur.fetchone()
        if not demande:
            flash("Demande introuvable.", "danger")
            return redirect(url_for('afficher_demandes_congé'))

        id_employe = demande[1]
        statut_manager = demande[7]
        role = session['role']
        email_employe = None

        if role == 'manager':
            if statut == 'accepte':
                curseur.execute("""
                    UPDATE demandes_congé SET statut_manager = 'accepte'
                    WHERE id = ?
                """, (id,))
                curseur.execute("SELECT email FROM utilisateurs WHERE id = ?", (id_employe,))
                email_employe = curseur.fetchone()[0]
                contenu = f"Une demande de congé de l'employé {id_employe} a été acceptée par le manager et requiert votre approbation."
                notifications.append((admin_email, contenu, "Congé"))
                envoyer_email("Réponse demande congé",admin_email,contenu)

            elif statut == 'refuse':
                curseur.execute("""
                    UPDATE demandes_congé 
                    SET statut = 'refuse', motif_refus = ?, statut_manager = 'refuse'
                    WHERE id = ?
                """, (motif_refus, id))
                curseur.execute("SELECT email FROM utilisateurs WHERE id = ?", (id_employe,))
                email_employe = curseur.fetchone()[0]
                sujet = "Refus de votre demande de congé"
                contenu = f"Bonjour,\n\nVotre demande de congé a été refusée par votre manager pour le motif suivant : {motif_refus}.\n\nCordialement,\nL'équipe RH"
                notifications.append((email_employe, contenu, "Congé"))
                envoyer_email("Réponse demande congé",email_employe,contenu)

        elif role == 'admin':
            if statut == 'accepte' and statut_manager == 'accepte':
                date_debut = datetime.strptime(demande[3], '%Y-%m-%d')
                date_fin = datetime.strptime(demande[4], '%Y-%m-%d')
                nombre_jours = compter_jours_de_conge(date_debut, date_fin)

                curseur.execute("SELECT solde_congé, email FROM utilisateurs WHERE id = ?", (id_employe,))
                utilisateur = curseur.fetchone()
                solde_conge = utilisateur[0]
                email_employe = utilisateur[1]

                if solde_conge >= nombre_jours:
                    nouveau_solde = solde_conge - nombre_jours
                    curseur.execute("UPDATE utilisateurs SET solde_congé = ? WHERE id = ?", (nouveau_solde, id_employe))
                    curseur.execute("""
                        UPDATE demandes_congé SET statut = 'accepte', statut_admin = 'accepte'
                        WHERE id = ?
                    """, (id,))
                    curseur.execute("""SELECT date_debut, date_fin FROM demandes_arrêt WHERE id =  ? """,(id,))
                    result = curseur.fetchone()
                    if result:
                        date_debut, date_fin = result
                    curseur.execute("""
                        DELETE FROM teletravail
                        WHERE id_employe = ? AND date_teletravail BETWEEN ? AND ?
                    """, (id_employe, date_debut, date_fin))

                    contenu = "Bonjour,\n\nVotre demande de congé a été acceptée par l'administrateur.\n\nCordialement,\nL'équipe RH"
                    sujet = "Acceptation de votre demande de congé"
                    notifications.append((email_employe, contenu, "Congé"))
                    envoyer_email("Réponse demande congé",email_employe,contenu)
                else:
                    flash("Solde de congé insuffisant pour cette demande.", "danger")

            elif statut == 'refuse':
                curseur.execute("""
                    UPDATE demandes_congé 
                    SET statut = 'refuse', motif_refus = ?, statut_admin = 'refuse'
                    WHERE id = ?
                """, (motif_refus, id))
                curseur.execute("SELECT email FROM utilisateurs WHERE id = ?", (id_employe,))
                email_employe = curseur.fetchone()[0]
                contenu = f"Bonjour,\n\nVotre demande de congé a été refusée par l'administrateur pour le motif suivant : {motif_refus}.\n\nCordialement,\nL'équipe RH"
                sujet = "Refus de votre demande de congé"
                notifications.append((email_employe, contenu, "Congé"))
                envoyer_email("Réponse demande congé",email_employe,contenu)
        
        connexion.commit()
        flash("Statut de la demande mis à jour avec succès.", "success")

    finally:
        connexion.close()

    for notif in notifications:
        creer_notification(*notif)

    return redirect(url_for('afficher_demandes_congé'))

@app.route("/supprimer_employe/<string:id>", methods=["POST"])
def supprimer_employe(id):
    """
    Admin : on vire l'employé, on clean ses assignations, c'est violent.
    """
    if 'role' not in session or session['role'] != 'admin':
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))
    connexion = connect_db()
    curseur = connexion.cursor()
    try:
        curseur.execute("DELETE FROM managers WHERE id_manager = ?", (id,))
        curseur.execute("DELETE FROM managers WHERE id_supervise = ?", (id,))
        curseur.execute("DELETE FROM utilisateurs WHERE id = ?", (id,))
        connexion.commit()
        flash("L`employé et ses assignations ont été supprimés avec succès.", "success")
    except Exception as e:
        connexion.rollback()
        flash(f"Erreur lors de la suppression de l`employé et de ses assignations: {str(e)}", "danger")
    finally:
        connexion.close()

    return redirect(url_for('afficher_employés'))

@app.route("/mettre_a_jour_employe/<string:id>", methods=["POST"])
def mettre_a_jour_employe(id):
    """
    Route pour mettre à jour les informations d'un employé.
    Si une nouvelle photo de profil est fournie, elle est uploadée sur S3,
    l'ancienne photo est supprimée (si elle n'est pas la valeur par défaut)
    et le champ 'photo' de la base est mis à jour avec la nouvelle clé S3.
    """
    if 'email' not in session or session.get('role') != 'admin':
        flash("Vous devez être connecté pour accéder à cette page.", "warning")
        return redirect(url_for('login'))

    try:
        connexion = connect_db()
        curseur = connexion.cursor()

        # Récupération de la photo actuelle dans la BDD
        curseur.execute("SELECT photo, email FROM utilisateurs WHERE id = ?", (id,))
        row = curseur.fetchone()
        if not row:
            flash("Employé introuvable.", "danger")
            return redirect(url_for('afficher_employés'))
        old_photo = row["photo"]
        old_email = row["email"]

        # Dictionnaire des champs à mettre à jour depuis le formulaire
        update_fields = {
            "nom": request.form['nom'],
            "prenom": request.form['prenom'],
            "date_naissance": request.form['date_naissance'],
            "poste": request.form['poste'],
            "departement": request.form['departement'],
            "salaire": request.form['salaire'],
            "solde_congé": request.form['solde_congé'],
            "role": request.form['role'],
            "sexualite": request.form['sexualite'],
            "telephone": request.form['telephone'],
            "adresse": request.form['adresse'],
            "ville": request.form['ville'],
            "code_postal": request.form['code_postal'],
            "pays": request.form['pays'],
            "nationalite": request.form['nationalite'],
            "numero_securite_sociale": request.form['numero_securite_sociale'],
            "date_embauche": request.form['date_embauche'],
            "type_contrat": request.form['type_contrat']
        }

        # Gestion de l'email (mise à jour si différent)
        nouveau_email = request.form['email']
        if nouveau_email != old_email:
            if email_existe(nouveau_email):
                flash("Cet email est déjà assigné à un autre employé.", "warning")
                return redirect(url_for('mettre_a_jour_employe', id=id))
            update_fields["email"] = nouveau_email
            session['email'] = nouveau_email  # Mettre à jour la session

        # Mise à jour du mot de passe s'il est renseigné
        mot_de_passe = request.form.get('mot_de_passe')
        if mot_de_passe:
            mot_de_passe_hash = ph.hash(mot_de_passe)
            update_fields["mot_de_passe"] = mot_de_passe_hash

        # Gestion de la photo de profil
        file = request.files.get('photo')
        if file and allowed_file(file.filename):
            s3_key = upload_file_to_s3(file, file.filename, folder="photo_profile")
            # Supprimer l'ancienne photo sur S3 si elle n'est pas la photo par défaut
            if old_photo and old_photo != 'default.png':
                delete_file_from_s3(old_photo)
            update_fields["photo"] = s3_key

        # Construction de la requête UPDATE
        set_clause = ", ".join([f"{key} = ?" for key in update_fields.keys()])
        parameters = list(update_fields.values())
        parameters.append(id)

        curseur.execute(f"UPDATE utilisateurs SET {set_clause} WHERE id = ?", parameters)
        connexion.commit()
        flash("Les informations de l`employé ont été mises à jour avec succès.", "success")
    except Exception as e:
        connexion.rollback()
        flash(f"Erreur lors de la mise à jour: {str(e)}", "danger")
    finally:
        connexion.close()
    return redirect(url_for('afficher_employés'))


@app.route('/admin_demandes_contact')
def admin_demandes_contact():
    """
    Admin : on check tous les gens qui nous ont écrit (ou nous ont trollé).
    """
    if 'role' not in session or session['role'] != 'admin':
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        SELECT dc.id_utilisateur, dc.id, dc.nom, dc.prenom, dc.email, dc.sujet, dc.message, dc.date_creation, dc.telephone,
               u.id AS utilisateur_id, u.nom AS utilisateur_nom, u.prenom AS utilisateur_prenom, u.telephone AS utilisateur_telephone
        FROM demandes_contact dc
        LEFT JOIN utilisateurs u ON dc.id_utilisateur = u.id
        ORDER BY dc.date_creation DESC
    """)
    demandes = [dict(row) for row in cur.fetchall()]
    connexion.close()

    notifications = récupérer_notifications(admin_email)
    nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(admin_email)
    marquer_notifications_comme_lues(admin_email)

    return render_template(
        'admin_contacts.html',
        demandes=demandes,
        notifications=notifications,
        nombre_notifications_non_lues=nombre_notifications_non_lues
    )

@app.route("/afficher_demandes_arrêts", methods=['GET', 'POST'])
def afficher_demandes_arrêts():
    """
    Admin : oh un arrêt maladie, voyons voir.
    """
    if 'role' not in session or session['role'] != 'admin':
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))
    if request.method == 'POST':
        id_arret = request.form['id']
        statut = request.form['statut']
        motif_refus = request.form.get('motif_refus', None)

        connexion = connect_db()
        cur = connexion.cursor()
        cur.execute("SELECT employe_email FROM demandes_arrêt WHERE id = ?", (id_arret,))
        result = cur.fetchone()
        if not result:
            return redirect(url_for('afficher_demandes_arrêts'))
        employe_email = result[0]

        if statut == 'refuse':
            cur.execute("""
                UPDATE demandes_arrêt
                SET statut = ?, motif_refus = ?
                WHERE id = ?
            """, (statut, motif_refus, id_arret))
            contenu = f"Bonjour,\n\nVotre demande d'arrêt maladie a été refusée pour le motif suivant : {motif_refus}.\n\nCordialement,\nL'équipe RH"
            sujet="Refus de demande d'arrêt"
        else:
            cur.execute("""
                UPDATE demandes_arrêt
                SET statut = ?, motif_refus = NULL
                WHERE id = ?
            """, (statut, id_arret))

            cur.execute("SELECT id FROM utilisateurs WHERE email= ?", (employe_email,))
            id_employe=cur.fetchone()[0]
            cur.execute("SELECT date_debut, date_fin FROM demandes_arrêt WHERE id = ?", (id_arret,))
            date_debut, date_fin = cur.fetchone()
            cur.execute("""
                DELETE FROM teletravail
                WHERE id_employe = ? AND date_teletravail BETWEEN ? AND ?
            """, (id_employe, date_debut, date_fin))
            contenu = "Bonjour,\n\nVotre demande d'arrêt maladie a été acceptée.\n\nCordialement,\nL'équipe RH"
            sujet="Acceptation de demande d'arrêt"

        flash("Statut de la demande est mis à jour avec succès.")
        connexion.commit()
        connexion.close()
        creer_notification(employe_email, contenu, "Arrét")
        envoyer_email(sujet,employe_email,contenu)

    notifications = récupérer_notifications(admin_email)
    nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(admin_email)
    marquer_notifications_comme_lues(admin_email)

    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("SELECT * FROM demandes_arrêt")
    arrets = cur.fetchall()
    connexion.close()

    return render_template(
        'admin_arrêts.html',
        arrets=arrets,
        notifications=notifications,
        nombre_notifications_non_lues=nombre_notifications_non_lues,
        photo=session.get('photo')
    )

@app.route('/afficher_demandes_prime')
def afficher_demandes_prime():
    """
    Admin : check de toutes les primes demandées.
    """
    if 'role' not in session or session['role'] != 'admin':
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        SELECT dp.id, u.nom AS employe_nom, u.prenom AS employe_prenom, m.nom AS manager_nom, 
               m.prenom AS manager_prenom, dp.montant, dp.motif, dp.statut, dp.motif_refus
        FROM demandes_prime dp
        JOIN utilisateurs u ON dp.id_employe = u.id
        JOIN utilisateurs m ON dp.id_manager = m.id
        ORDER BY dp.date_creation DESC
    """)
    demandes = cur.fetchall()
    connexion.close()

    notifications = récupérer_notifications(admin_email)
    nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(admin_email)
    marquer_notifications_comme_lues(admin_email)

    return render_template(
        'admin_primes.html',
        demandes=demandes,
        notifications=notifications,
        nombre_notifications_non_lues=nombre_notifications_non_lues,
        photo=session.get('photo')
    )

@app.route('/traiter_demande_prime/<int:id>', methods=['POST'])
def traiter_demande_prime(id):
    """
    Admin: on traite la prime (accept / refuse).
    """
    if 'role' not in session or session['role'] != 'admin':
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))
    statut = request.form['statut']
    motif_refus = request.form.get('motif_refus')

    connexion = connect_db()
    cur = connexion.cursor()

    cur.execute("""
        SELECT u.nom, u.prenom, m.email 
        FROM demandes_prime dp
        JOIN utilisateurs u ON dp.id_employe = u.id
        JOIN utilisateurs m ON dp.id_manager = m.id
        WHERE dp.id = ?
    """, (id,))
    demande = cur.fetchone()

    if demande:
        nom_employe, prenom_employe, manager_email = demande
    else:
        flash("Demande de prime introuvable.", "danger")
        return redirect(url_for('afficher_demandes_prime'))

    if statut == 'refuse' and motif_refus:
        cur.execute("""
            UPDATE demandes_prime
            SET statut = ?, motif_refus = ?
            WHERE id = ?
        """, (statut, motif_refus, id))
        sujet = "Refus de votre demande de prime"
        contenu = f"Bonjour,\n\nVotre demande de prime pour monsieur {nom_employe} {prenom_employe} a été refusée.\n\nCordialement,\nL'équipe RH"
    elif statut == 'accepte':
        cur.execute("""
            UPDATE demandes_prime
            SET statut = ?, motif_refus = NULL
            WHERE id = ?
        """, (statut, id))
        sujet = "Acceptation de votre demande de prime"
        contenu = f"Bonjour,\n\nVotre demande de prime pour monsieur {nom_employe} {prenom_employe} a été acceptée.\n\nCordialement,\nL'équipe RH"

    connexion.commit()
    connexion.close()

    envoyer_email(sujet, manager_email, contenu)
    creer_notification(manager_email, contenu, "Prime")

    flash("Demande de prime traitée avec succès.", "success")
    return redirect(url_for('afficher_demandes_prime'))

@app.route('/coffre_fort', methods=['GET', 'POST'])
def coffre_fort():
    """
    Admin voit tout, employé voit seulement ses docs. On fait joujou avec S3.
    """
    if 'email' not in session:
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))

    connexion = connect_db()
    cur = connexion.cursor()

    if session.get('role') == 'admin':
        if request.method == 'POST':
            employe_id = request.form['employe_id']
            cur.execute("SELECT nom, prenom, email FROM utilisateurs WHERE id = ?", (employe_id,))
            employe = cur.fetchone()
            if not employe:
                flash("Employé introuvable.", "danger")
                return redirect(url_for('coffre_fort'))
            
            nom, prenom, employe_email = employe

            prefix_bulletins = f"coffre_fort/bulletins/{nom}{prenom}/"
            bulletins_keys = list_files_in_s3(prefix_bulletins)
            bulletins_urls = [generate_presigned_url(k) for k in bulletins_keys]

            prefix_contrats = f"coffre_fort/contrats/{nom}{prenom}/"
            contrats_keys = list_files_in_s3(prefix_contrats)
            contrats_urls = [generate_presigned_url(k) for k in contrats_keys]

            prefix_autres = f"coffre_fort/autres/{nom}{prenom}/"
            autres_keys = list_files_in_s3(prefix_autres)
            autres_urls = [generate_presigned_url(k) for k in autres_keys]

            notifications = récupérer_notifications(admin_email)
            nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(admin_email)
            marquer_notifications_comme_lues(admin_email)

            return render_template(
                'coffre_fort.html',
                bulletins=bulletins_urls,
                contrats=contrats_urls,
                autres=autres_urls,
                nom=nom,
                prenom=prenom,
                employe_id=employe_id,
                role=session.get('role'),
                notifications=notifications,
                nombre_notifications_non_lues=nombre_notifications_non_lues,
                photo=session.get('photo')
            )

        cur.execute("SELECT id, nom, prenom FROM utilisateurs WHERE role != 'admin'")
        employes = cur.fetchall()
        notifications = récupérer_notifications(admin_email)
        nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(admin_email)
        marquer_notifications_comme_lues(admin_email)

        return render_template(
            'admin_coffre_fort.html',
            employes=employes,
            notifications=notifications,
            nombre_notifications_non_lues=nombre_notifications_non_lues,
            photo=session.get('photo')
        )
    else:
        email = session['email']
        cur.execute("SELECT id, nom, prenom FROM utilisateurs WHERE email = ?", (email,))
        employe = cur.fetchone()
        if not employe:
            flash("Utilisateur introuvable.", "danger")
            return redirect(url_for('login'))

        employe_id, nom, prenom = employe

        prefix_bulletins = f"coffre_fort/bulletins/{nom}{prenom}/"
        bulletins_keys = list_files_in_s3(prefix_bulletins)
        bulletins_urls = [generate_presigned_url(k) for k in bulletins_keys]

        prefix_contrats = f"coffre_fort/contrats/{nom}{prenom}/"
        contrats_keys = list_files_in_s3(prefix_contrats)
        contrats_urls = [generate_presigned_url(k) for k in contrats_keys]

        prefix_autres = f"coffre_fort/autres/{nom}{prenom}/"
        autres_keys = list_files_in_s3(prefix_autres)
        autres_urls = [generate_presigned_url(k) for k in autres_keys]

        notifications = récupérer_notifications(email)
        nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(email)
        marquer_notifications_comme_lues(email)

        return render_template(
            'coffre_fort.html',
            bulletins=bulletins_urls,
            contrats=contrats_urls,
            autres=autres_urls,
            nom=nom,
            prenom=prenom,
            employe_id=employe_id,
            role=session.get('role'),
            notifications=notifications,
            nombre_notifications_non_lues=nombre_notifications_non_lues,
            photo=session.get('photo')
        )

@app.route('/deposer_document/<string:id_employe>', methods=['GET', 'POST'])
def deposer_document(id_employe):
    """
    Admin dépose le document dans le coffre-fort S3. 
    """
    if 'role' not in session or session['role'] != 'admin':
        flash("Vous devez être connecté en tant qu'administrateur.")
        return redirect(url_for('login'))

    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("SELECT nom, prenom, email FROM utilisateurs WHERE id = ?", (id_employe,))
    employe = cur.fetchone()
    if not employe:
        flash("Employé introuvable.", "danger")
        return redirect(url_for('afficher_employés'))

    nom, prenom, email_employe = employe

    if request.method == 'POST':
        type_document = request.form['type_document']
        fichier = request.files['fichier']

        if not fichier or not allowed_file_document(fichier.filename):
            flash("Format de fichier non autorisé (PDF uniquement).", "danger")
            return redirect(request.url)

        def generer_nom_fichier():
            random_digits = ''.join(random.choices(string.digits, k=8))
            mois = request.form.get('mois')
            annee = request.form.get('annee')
            nom_document = request.form.get('nom_document')

            if type_document == "bulletin":
                if not mois or not annee:
                    flash("Le mois et l'année sont requis pour un bulletin.", "danger")
                    return None
                return f"{nom}.{prenom}_Bulletin_{mois}_{annee}_{random_digits}.pdf"
            elif type_document == "contrat":
                if not mois or not annee:
                    flash("Le mois et l'année sont requis pour un contrat.", "danger")
                    return None
                return f"{nom}.{prenom}_Contrat_{mois}_{annee}_{random_digits}.pdf"
            else:
                if not nom_document:
                    flash("Le nom du document est requis pour un document 'autre'.", "danger")
                    return None
                return f"{nom}.{prenom}_{nom_document}_{random_digits}.pdf"

        nom_fichier = generer_nom_fichier()
        if not nom_fichier:
            return redirect(request.url)

        nom_fichier = normalize_filename(nom_fichier)
        if type_document == "bulletin":
            s3_prefix = f"coffre_fort/bulletins/{nom}{prenom}/"
        elif type_document == "contrat":
            s3_prefix = f"coffre_fort/contrats/{nom}{prenom}/"
        else:
            s3_prefix = f"coffre_fort/autres/{nom}{prenom}/"

        s3_key = upload_file_to_s3(fichier, nom_fichier, folder=s3_prefix)
        flash("Document enregistré avec succès.", "success")

        sujet = "Dépot de document dans votre coffre-fort"
        contenu = (
            "Bonjour,\n\n"
            "Un nouveau document a été déposé dans votre coffre-fort.\n\n"
            "Cordialement,\nL'équipe RH."
        )
        envoyer_email(sujet, email_employe, contenu)
        creer_notification(email_employe, contenu, "document")

    notifications = récupérer_notifications(admin_email)
    nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(admin_email)
    marquer_notifications_comme_lues(admin_email)

    return render_template(
        'admin_dépot.html',
        employe=(nom, prenom),
        notifications=notifications,
        nombre_notifications_non_lues=nombre_notifications_non_lues,
        photo=session.get('photo')
    )

@app.route('/assigner_manager', methods=['GET', 'POST'])
def assigner_manager():
    """
    Admin : on indique qui manage qui, c'est la pyramide.
    """
    if 'role' not in session or session['role'] != 'admin':
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))
    connexion = connect_db()
    curseur = connexion.cursor()

    curseur.execute("SELECT id, nom, prenom, email FROM utilisateurs WHERE role = 'manager'")
    managers = curseur.fetchall()

    curseur.execute("SELECT id, nom, prenom, email FROM utilisateurs WHERE role = 'employe'")
    employes = curseur.fetchall()

    curseur.execute("SELECT id FROM utilisateurs WHERE is_director = 1")
    directeur = curseur.fetchone()
    directeur_id = directeur["id"] if directeur else None

    if request.method == 'POST':
        id_manager = request.form.get('manager')
        id_supervise = request.form.get('supervise')
        if not id_manager or not id_supervise:
            flash("Veuillez sélectionner un manager et un employé.", "error")
        elif id_manager == id_supervise:
            flash("Un manager ne peut pas se superviser lui-même.", "error")
        else:
            try:
                curseur.execute("""
                    SELECT id_manager 
                    FROM managers 
                    WHERE id_supervise = ?
                """, (id_supervise,))
                existing_supervisor = curseur.fetchone()

                if existing_supervisor:
                    flash("Cet employé ou manager est déjà supervisé par un autre manager.", "error")
                else:
                    curseur.execute("""
                        SELECT COUNT(*) FROM managers WHERE id_manager = ? AND id_supervise = ?
                    """, (id_manager, id_supervise))
                    if curseur.fetchone()[0] > 0:
                        flash("Cette assignation existe déjà.", "error")
                    else:
                        curseur.execute("""
                            INSERT INTO managers (id_manager, id_supervise)
                            VALUES (?, ?)
                        """, (id_manager, id_supervise))
                        connexion.commit()
                        flash("Supervision assignée avec succès.", "success")
            except sqlite3.IntegrityError:
                flash("Erreur : Contrainte d'unicité violée.", "error")
            except Exception as e:
                flash(f"Erreur inattendue : {e}", "error")

    curseur.execute("""
        SELECT m.id AS manager_id, m.nom AS manager_nom, m.prenom AS manager_prenom, 
               e.id AS supervise_id, e.nom AS supervise_nom , e.prenom AS supervise_prenom
        FROM managers
        JOIN utilisateurs m ON managers.id_manager = m.id
        JOIN utilisateurs e ON managers.id_supervise = e.id
    """)
    assignations = curseur.fetchall()
    connexion.close()

    notifications = récupérer_notifications(admin_email)
    nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(admin_email)
    marquer_notifications_comme_lues(admin_email)

    return render_template(
        'admin_assigner_manager.html',
        managers=managers,
        employes=employes,
        assignations=assignations,
        directeur_id=directeur_id,
        notifications=notifications,
        nombre_notifications_non_lues=nombre_notifications_non_lues,
        photo=session.get('photo')
    )

@app.route('/designer_directeur', methods=['POST'])
def designer_directeur():
    """
    Admin : on couronne un nouveau directeur, c'est la vie.
    """
    if 'role' not in session or session['role'] != 'admin':
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))
    manager_id = request.form.get('manager')
    if not manager_id:
        flash("Veuillez sélectionner un manager.", "error")
        return redirect(url_for('assigner_manager'))

    connexion = connect_db()
    curseur = connexion.cursor()

    curseur.execute("UPDATE utilisateurs SET is_director = 0")
    curseur.execute("UPDATE utilisateurs SET is_director = 1 WHERE id = ?", (manager_id,))
    connexion.commit()
    connexion.close()

    flash("Le directeur a été mis à jour.", "success")
    return redirect(url_for('assigner_manager'))

@app.route('/supprimer_assignation/<string:manager_id>/<string:supervise_id>', methods=['POST'])
def supprimer_assignation(manager_id, supervise_id):
    """
    Admin : supprime la relation manager->employé.
    """
    if 'role' not in session or session['role'] != 'admin':
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))
    connexion = connect_db()
    curseur = connexion.cursor()
    try:
        curseur.execute(
            "SELECT id_manager, id_supervise FROM managers WHERE id_manager = ? AND id_supervise = ?",
            (manager_id, supervise_id)
        )
        assignation = curseur.fetchone()

        if assignation:
            curseur.execute(
                "DELETE FROM managers WHERE id_manager = ? AND id_supervise = ?",
                (manager_id, supervise_id)
            )
            connexion.commit()
            flash("Assignation supprimée avec succès.", "success")
        else:
            flash("Aucune assignation trouvée pour les IDs spécifiés.", "error")
    except Exception as e:
        connexion.rollback()
        flash(f"Erreur lors de la suppression de l'assignation : {str(e)}", "error")
    finally:
        connexion.close()

    return redirect(url_for('assigner_manager'))

@app.route('/api/récupérer_orgchart', methods=['GET'])
def récupérer_orgchart():
    """
    Admin : renvoie l'arbre managérial, du grand chef vers les subordonnés.
    """
    if 'role' not in session or session['role'] != 'admin':
        flash("Vous devez être connecté pour accéder à cette page.")
        return jsonify({"error": "Unauthorized access"}), 401

    connexion = connect_db()
    curseur = connexion.cursor()
    curseur.execute("SELECT id, nom FROM utilisateurs WHERE is_director = 1")
    directeur = curseur.fetchone()
    if not directeur:
        return jsonify({"error": "No director found"}), 400

    def build_tree(manager_id):
        curseur.execute("""
            SELECT u.id, u.nom 
            FROM managers m
            JOIN utilisateurs u ON m.id_supervise = u.id
            WHERE m.id_manager = ?
        """, (manager_id,))
        children = curseur.fetchall()
        return [
            {
                "name": child["nom"],
                "children": build_tree(child["id"])
            }
            for child in children
        ]

    orgchart_data = {
        "name": directeur["nom"],
        "children": build_tree(directeur["id"])
    }
    connexion.close()
    return jsonify(orgchart_data)

@app.route('/feedback_results')
def feedback_results():
    """
    Admin : analyses anonymes du feedback pour le mois choisi.
    Si aucun mois n'est sélectionné, le mois actuel est utilisé par défaut.
    """
    if 'role' not in session or session['role'] != 'admin':
        flash("Accès réservé aux administrateurs.", "danger")
        return redirect(url_for('login'))
    
    # Get selected month from query parameter; default to current month (format YYYY-MM)
    selected_month = request.args.get('month', datetime.now().strftime('%Y-%m'))
    
    connexion = connect_db()
    cur = connexion.cursor()
    # Retrieve feedbacks only for the selected month (using strftime on created_at)
    cur.execute("""
        SELECT * FROM feedback
        WHERE strftime('%Y-%m', created_at) = ?
    """, (selected_month,))
    feedbacks = cur.fetchall()
    connexion.close()
    
    notifications = récupérer_notifications(admin_email)
    nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(admin_email)
    marquer_notifications_comme_lues(admin_email)
    
    total = len(feedbacks)
    if total > 0:
        avg_env          = round(sum([int(f['rating_env']) for f in feedbacks]) / total, 2)
        avg_mgmt         = round(sum([int(f['rating_management']) for f in feedbacks]) / total, 2)
        avg_work         = round(sum([int(f['rating_worklife']) for f in feedbacks]) / total, 2)
        avg_comm         = round(sum([int(f['rating_comm']) for f in feedbacks]) / total, 2)
        avg_recognition  = round(sum([int(f['rating_recognition']) for f in feedbacks]) / total, 2)
        avg_training     = round(sum([int(f['rating_training']) for f in feedbacks]) / total, 2)
        avg_equipment    = round(sum([int(f['rating_equipment']) for f in feedbacks]) / total, 2)
        avg_team         = round(sum([int(f['rating_team']) for f in feedbacks]) / total, 2)
        avg_meetings     = round(sum([int(f['rating_meetings']) for f in feedbacks]) / total, 2)
        avg_transparency = round(sum([int(f['rating_transparency']) for f in feedbacks]) / total, 2)
    else:
        avg_env = avg_mgmt = avg_work = avg_comm = avg_recognition = avg_training = avg_equipment = avg_team = avg_meetings = avg_transparency = 0

    suggestions = [f['suggestion'] for f in feedbacks if f['suggestion'].strip() != '']

    return render_template("admin_feedback.html",
                           photo=session.get('photo'),
                           selected_month=selected_month,
                           total=total, 
                           avg_env=avg_env, 
                           avg_mgmt=avg_mgmt, 
                           avg_work=avg_work,
                           avg_comm=avg_comm,
                           avg_recognition=avg_recognition,
                           avg_training=avg_training,
                           avg_equipment=avg_equipment,
                           avg_team=avg_team,
                           avg_meetings=avg_meetings,
                           avg_transparency=avg_transparency,
                           suggestions=suggestions,
                           notifications=notifications,
                           nombre_notifications_non_lues=nombre_notifications_non_lues)


# ┌─────────────────────────────────────────────────────────────┐
# │  [MANAGER LE CHAMPION DU MONDE: ON GÈRE LES BOUCLES ET TOUT]│
# └─────────────────────────────────────────────────────────────┘

@app.route('/manager_dashboard')
def manager_dashboard():
    """
    Manager : un petit tableau de bord pour superviser ses équipiers.
    """
    if 'role' not in session or session['role'] != 'manager':
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))
    manager_id = session['id']
    connexion = connect_db()
    curseur = connexion.cursor()
    curseur.execute("""
        SELECT u.id, u.nom, u.prenom, u.date_naissance, u.poste, u.departement, u.email, u.photo, u.teletravail_max,
               (CASE WHEN EXISTS (
                   SELECT 1 FROM demandes_congé WHERE demandes_congé.id_utilisateurs = u.id AND demandes_congé.statut = 'en attente'
               ) THEN 1 ELSE 0 END) AS conge_demande
        FROM utilisateurs u
        JOIN managers m ON m.id_supervise = u.id
        WHERE m.id_manager = ?
    """, (manager_id,))
    employees = curseur.fetchall()
    connexion.close()

    notifications = récupérer_notifications(session['email'])
    nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(session['email'])
    marquer_notifications_comme_lues(session['email'])

    return render_template(
        'manager_menu.html',
        employees=employees,
        role=session['role'],
        notifications=notifications,
        nombre_notifications_non_lues=nombre_notifications_non_lues,
        photo=session.get('photo')
    )

@app.route("/mettre_a_jour_teletravail/<string:employe_id>", methods=['POST'])
def mettre_a_jour_teletravail(employe_id):
    """
    Manager : régler la jauge de télétravail max d'un employé.
    """
    if 'role' not in session or session['role'] != 'manager':
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))
    jours_max_teletravail = request.form.get('jours_max_teletravail')
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        UPDATE utilisateurs
        SET teletravail_max = ?
        WHERE id = ?
    """, (jours_max_teletravail, employe_id))
    cur.execute("""SELECT teletravail_max FROM utilisateurs WHERE id = ?""", (employe_id,))
    connexion.commit()
    connexion.close()

    flash("Nombre de jours de télétravail mis à jour avec succès.", "success")
    return redirect(url_for('manager_dashboard'))

@app.route('/soumettre_demande_prime', methods=['GET', 'POST'])
def soumettre_demande_prime():
    """
    Manager : envoie une demande de prime pour un employé qu'il gère.
    """
    if 'role' not in session or session['role'] != 'manager':
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))
    id_manager = session['id']
    manager_email = session['email']

    if request.method == 'POST':
        id_employe = request.form['id_employe']
        montant = float(request.form['montant'])
        motif = request.form['motif']

        connexion = connect_db()
        cur = connexion.cursor()
        cur.execute("""
            INSERT INTO demandes_prime (id_manager, id_employe, montant, motif)
            VALUES (?, ?, ?, ?)
        """, (id_manager, id_employe, montant, motif))

        cur.execute("""
            SELECT nom, prenom, email
            FROM utilisateurs
            WHERE id = ?
        """, (id_employe,))
        employe = cur.fetchone()

        cur.execute("""
            SELECT nom, prenom
            FROM utilisateurs
            WHERE id = ?
        """, (id_employe,))
        manager = cur.fetchone()
        connexion.commit()
        connexion.close()

        if employe and manager:
            nom_employe, prenom_employe, employe_email = employe
            nom_manager, prenom_manager = manager
            sujet = "Nouvelle demande de prime soumise"
            contenu = f"Bonjour,\n\nUne demande de prime a été soumise par votre manager {nom_manager} {prenom_manager} pour vous.\n\nMontant demandé : {montant}€\nMotif : {motif}\n\nCordialement,\nL'équipe RH."
            envoyer_email(sujet, employe_email, contenu)

            contenu_admin = f"Bonjour,\n\nUne demande de prime a été soumise pour l'employé {nom_employe} {prenom_employe}.\nMontant demandé : {montant}€\nMotif : {motif}\n\nCordialement,\nL'équipe RH."
            creer_notification(admin_email, contenu_admin, "Prime")

        flash("Demande de prime soumise avec succès.", "success")
        return redirect(url_for('manager_primes'))

    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        SELECT u.id, u.nom, u.prenom
        FROM utilisateurs u
        JOIN managers m ON m.id_supervise = u.id
        WHERE m.id_manager = ?
    """, (id_manager,))
    employes = cur.fetchall()

    cur.execute("""SELECT email FROM utilisateurs WHERE id=?""", (id_manager,))
    manager_email = cur.fetchone()[0]
    connexion.close()

    notifications = récupérer_notifications(manager_email)
    nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(manager_email)
    return render_template(
        'manager_soumettre_primes.html',
        employes=employes,
        notifications=notifications,
        nombre_notifications_non_lues=nombre_notifications_non_lues,
        photo=session.get('photo')
    )

@app.route('/manager_primes', methods=['GET'])
def manager_primes():
    """
    Manager : liste des primes qu'il a soumises.
    """
    if 'role' not in session or session['role'] != 'manager':
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))
    manager_id = session['id']
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        SELECT dp.id, u.nom AS employe_nom, u.prenom AS employe_prenom, dp.montant, dp.motif, dp.statut, dp.motif_refus
        FROM demandes_prime dp
        JOIN utilisateurs u ON dp.id_employe = u.id
        WHERE dp.id_manager = ?
        ORDER BY dp.date_creation DESC
    """, (manager_id,))
    primes = cur.fetchall()

    cur.execute("""SELECT email FROM utilisateurs WHERE id = ?""", (manager_id,))
    manager_email = cur.fetchone()[0]
    notifications = récupérer_notifications(manager_email)
    nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(manager_email)
    connexion.close()

    return render_template(
        'manager_primes.html',
        primes=primes,
        notifications=notifications,
        nombre_notifications_non_lues=nombre_notifications_non_lues,
        photo=session.get('photo')
    )

@app.route('/réunion_scheduler', methods=['GET', 'POST']) 
def réunion_scheduler():
    """
    Manager : planifie une petite réunion, invite des gens.
    """
    if 'role' not in session or session['role'] != 'manager':
        flash("Vous devez être connecté en tant que manager pour accéder à cette page.")
        return redirect(url_for('login'))

    manager_id = session['id']
    connexion = connect_db()
    cur = connexion.cursor()

    if request.method == 'POST':
        title = request.form['title']
        date_time = request.form['date_time']
        invited_employees = request.form.getlist('employees')

        cur.execute("""
            INSERT INTO réunion (title, date_time, status, created_by)
            VALUES (?, ?, 'Scheduled', ?)
        """, (title, date_time, manager_id))
        meeting_id = cur.lastrowid

        for employee_id in invited_employees:
            cur.execute("""
                INSERT INTO réponse_réunion (meeting_id, employee_id, status)
                VALUES (?, ?, 'en attente')
            """, (meeting_id, employee_id))

            cur.execute("""SELECT email FROM utilisateurs WHERE id = ?""", (employee_id,))
            employee_email = cur.fetchone()[0]

            sujet = "Invitation à une réunion"
            contenu = f"Bonjour,\n\nVotre manager vous a invité à une réunion : {title}.\nVeuillez accepter ou refuser la demande.\n\nCordialement,\nL'équipe RH"
            envoyer_email(sujet, employee_email, contenu)
            creer_notification(employee_email, contenu, "Invitation")

        connexion.commit()
        flash("L'invitation pour la réunion a été envoyée avec succès !", "success")
        return redirect(url_for('réunion_scheduler'))

    cur.execute("""
        SELECT id, nom, prenom 
        FROM utilisateurs 
        WHERE role = 'employe' 
          AND id IN (SELECT id_supervise FROM managers WHERE id_manager = ?) 
        UNION 
        SELECT id, nom, prenom FROM utilisateurs WHERE role = 'manager' AND id != ?
    """, (manager_id, manager_id))
    employees = cur.fetchall()

    cur.execute("""
        SELECT m.id, m.title, m.date_time, COUNT(a.id) AS invited_count, 
               SUM(CASE WHEN a.status = 'Accepted' THEN 1 ELSE 0 END) AS accepted_count,
               SUM(CASE WHEN a.status = 'Rejected' THEN 1 ELSE 0 END) AS rejected_count
        FROM réunion m
        JOIN réponse_réunion a ON m.id = a.meeting_id
        WHERE m.created_by = ?
        GROUP BY m.id
        ORDER BY m.date_time DESC
    """, (manager_id,))
    meetings = cur.fetchall()

    cur.execute("""SELECT email FROM utilisateurs WHERE id=?""", (manager_id,))
    manager_email = cur.fetchone()[0]
    notifications = récupérer_notifications(manager_email)
    nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(manager_email)

    connexion.close()

    return render_template(
        'manager_réunion.html',
        employees=employees,
        meetings=meetings,
        notifications=notifications,
        nombre_notifications_non_lues=nombre_notifications_non_lues,
        photo=session.get('photo')
    )

# ┌─────────────────────────────────────────────────────────────┐
# │  [EMPLOYÉ: YOLO, MON ESPACE PERSO, ON GÈRE MES CONGÉS, ETC]│
# └─────────────────────────────────────────────────────────────┘

@app.route("/voir_mes_infos")
def voir_mes_infos():
    """
    L'employé admire ses informations perso, c'est beau.
    """
    if 'email' not in session or session['role'] == "admin":
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))

    email = session['email']
    user_id = session['id']
    notifications = récupérer_notifications(email)
    nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(email)
    marquer_notifications_comme_lues(email)

    connexion = connect_db()
    curseur = connexion.cursor()
    curseur.execute("""
        SELECT nom, prenom, date_naissance, poste, departement, email, solde_congé, salaire,
               photo, id, role, sexualite, telephone, adresse, ville, code_postal, pays,
               nationalite, numero_securite_sociale, date_embauche, type_contrat
        FROM utilisateurs WHERE email = ?
    """, (email,))
    resultats = curseur.fetchall()
    connexion.close()

    return render_template(
        "employé_menu.html",
        resultats=resultats,
        role=session.get('role'),
        photo=session.get('photo'),
        notifications=notifications,
        nombre_notifications_non_lues=nombre_notifications_non_lues
    )

@app.route('/api/recuperer_evenements')
def recuperer_evenements():
    """
    On renvoie un JSON pour FullCalendar : congés, arrêts, réunions, télétravail.
    """
    if 'email' not in session or session['role'] == "admin":
        flash("Vous devez être connecté pour accéder à cette page.")
        return jsonify([])

    connexion = connect_db()
    cur = connexion.cursor()

    email = session['email']
    cur.execute("SELECT id FROM utilisateurs WHERE email = ?", (email,))
    id_employe = cur.fetchone()[0]

    cur.execute("""
        SELECT date_debut, date_fin, description 
        FROM demandes_congé 
        WHERE id_utilisateurs = ? AND statut = 'accepte'
    """, (id_employe,))
    conges = cur.fetchall()

    cur.execute("""
        SELECT date_debut, date_fin, description 
        FROM demandes_arrêt 
        WHERE employe_email = ? AND statut = 'accepte'
    """, (email,))
    arrets = cur.fetchall()

    cur.execute("""
        SELECT m.date_time, m.title 
        FROM réunion m
        JOIN réponse_réunion ma ON m.id = ma.meeting_id
        WHERE (ma.employee_id = (SELECT id FROM utilisateurs WHERE email = ?) AND ma.status = 'Accepted') OR m.created_by = ?
    """, (email, id_employe))
    reunions = cur.fetchall()

    cur.execute("""
        SELECT date_teletravail 
        FROM teletravail 
        WHERE id_employe = (SELECT id FROM utilisateurs WHERE email = ?)
    """, (email,))
    teletravail = cur.fetchall()

    evenements = []

    for conge in conges:
        evenements.append({
            'title': 'Congé',
            'start': conge[0],
            'end': conge[1],
            'description': conge[2],
            'color': '#1e6c4d'
        })

    for arret in arrets:
        evenements.append({
            'title': 'Arrêt Maladie',
            'start': arret[0],
            'end': arret[1],
            'description': arret[2],
            'color': '#ac6430'
        })

    for reunion in reunions:
        date_time = reunion[0]
        if isinstance(date_time, str):
            date_time = datetime.fromisoformat(date_time)
        heure_reunion = date_time.strftime('%H:%M')
        evenements.append({
            'title': 'Réunion : ' + reunion[1],
            'start': reunion[0],
            'description': f"Heure : {heure_reunion}",
            'color': '#ae0d38'
        })

    for jour in teletravail:
        evenements.append({
            'title': 'Télétravail',
            'start': jour[0],
            'color': '#0083f6'
        })

    connexion.close()
    return jsonify(evenements)

@app.route("/soumettre_demande_conge", methods=["GET", "POST"])
def soumettre_demande_conge():
    """
    L'employé envoie un congé. 
    """
    if 'email' not in session or session['role'] == "admin":
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))

    connexion = connect_db()
    cur = connexion.cursor()
    employe_email = session['email']
    notifications = récupérer_notifications(employe_email)
    nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(employe_email)
    marquer_notifications_comme_lues(employe_email)

    id_emp = session['id']
    cur.execute("SELECT solde_congé, is_director FROM utilisateurs WHERE id = ?", (id_emp,))
    utilisateur = cur.fetchone()
    if utilisateur is None:
        connexion.close()
        return "Utilisateur non trouvé", 404

    solde_conge = utilisateur[0]
    is_director = utilisateur[1]

    if request.method == "POST":
        raison = request.form['raison']
        date_debut = request.form['date_debut']
        date_fin = request.form['date_fin']
        if date_fin < date_debut:
            flash("La date de fin ne peut pas être avant la date de début.", "error")
            connexion.close()
            return render_template("employé_soumettre_congés.html", notifications=notifications, nombre_notifications_non_lues=nombre_notifications_non_lues,photo=session.get('photo'))

        today = datetime.today().date()
        date_debut_dt = datetime.strptime(date_debut, "%Y-%m-%d").date()

        erreur = verifier_toutes_contraintes(id_emp, date_debut_dt, datetime.strptime(date_fin, "%Y-%m-%d").date(), "congé")
        if erreur:
            flash(erreur, "danger")
            return render_template("employé_soumettre_congés.html", notifications=notifications, nombre_notifications_non_lues=nombre_notifications_non_lues,photo=session.get('photo'))

        if date_debut_dt < today:
            flash("La date de début ne peut pas être avant la date actuelle.", "error")
            connexion.close()
            return render_template("employé_soumettre_congés.html", notifications=notifications, nombre_notifications_non_lues=nombre_notifications_non_lues,photo=session.get('photo'))

        date_fin_dt = datetime.strptime(date_fin, "%Y-%m-%d").date()
        nombre_jours = (date_fin_dt - date_debut_dt).days + 1

        if solde_conge < nombre_jours:
            flash(f"Vous n`avez pas assez de jours de congé disponibles. Solde actuel: {solde_conge} jours.", "error")
            connexion.close()
            return render_template("employé_soumettre_congés.html",notifications=notifications, nombre_notifications_non_lues=nombre_notifications_non_lues,photo=session.get('photo'))

        description = request.form['description']
        file = request.files.get('piece_jointe')
        if file and allowed_file(file.filename):
            s3_key = upload_file_to_s3(file, file.filename, folder="congés")
            file_name_only = s3_key
        else:
            file_name_only = None

        statut_manager = "accepte" if is_director else "en attente"
        statut_admin = "en attente"

        cur.execute("""
            INSERT INTO demandes_congé (
                id_utilisateurs, raison, date_debut, date_fin, description, pièce_jointe, statut_manager, statut_admin
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (id_emp, raison, date_debut_dt, date_fin_dt, description, file_name_only, statut_manager, statut_admin))
        connexion.commit()

        contenu = f"Bonjour,\n\nVotre demande de congé du {date_debut} au {date_fin} a été soumise avec succès.\n\nCordialement,\nL'équipe RH"
        envoyer_email("Confirmation de dépôt de demande de congé", employe_email, contenu)
        contenu_admin = f"Une demande de congé a été soumise par {employe_email}."
        creer_notification(admin_email, contenu_admin, "Congé")

        if is_director:
            flash("Votre demande de congé a été transmise à l`administrateur.", "success")
        else:
            flash("Votre demande de congé a été soumise avec succès. En attente de validation du manager.", "success")

        cur.execute("""
            DELETE FROM teletravail
            WHERE id_employe = ? AND date_teletravail BETWEEN ? AND ?
        """, (id_emp, date_debut_dt, date_fin_dt))
        connexion.commit()
        connexion.close()
        return redirect(url_for('mes_demandes_conges'))

    connexion.close()
    return render_template("employé_soumettre_congés.html", notifications=notifications, nombre_notifications_non_lues=nombre_notifications_non_lues,photo=session.get('photo'))

@app.route("/mes_demandes_conges")
def mes_demandes_conges():
    """
    L'employé : je veux voir mes congés passés, en attente, etc.
    """
    if 'email' not in session or session['role'] == "admin":
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))

    id_emp = session['id']
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("SELECT email FROM utilisateurs WHERE id = ?", (id_emp,))
    employe_email = cur.fetchone()[0]

    cur.execute("""
        SELECT * FROM demandes_congé
        WHERE id_utilisateurs = ?
    """, (id_emp,))
    demandes = cur.fetchall()
    connexion.close()

    notifications = récupérer_notifications(employe_email)
    nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(employe_email)
    marquer_notifications_comme_lues(employe_email)

    return render_template(
        "employé_congés.html",
        demandes=demandes,
        notifications=notifications,
        nombre_notifications_non_lues=nombre_notifications_non_lues,
        photo=session.get('photo')
    )

@app.route('/soumettre_demande_arrêt', methods=['GET', 'POST'])
def soumettre_demande_arrêt():
    """
    L'employé : je dépose un arrêt maladie, c'est triste mais c'est la vie.
    """
    if 'email' not in session or session['role'] == "admin":
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))

    employe_email = session['email']
    notifications = récupérer_notifications(employe_email)
    nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(employe_email)
    marquer_notifications_comme_lues(employe_email)

    if request.method == 'POST':
        type_maladie = request.form['type_maladie']
        description = request.form['description']

        today = datetime.today().date()
        date_debut = datetime.strptime(request.form['date_debut'], "%Y-%m-%d").date()
        date_fin = datetime.strptime(request.form['date_fin'], "%Y-%m-%d").date()

        if date_fin < date_debut:
            flash("La date de fin ne peut pas être avant la date de début.", "danger")
            return render_template('employé_soumettre_arrêts.html', notifications=notifications, nombre_notifications_non_lues=nombre_notifications_non_lues,photo=session.get('photo'))

        if date_debut < today:
            flash("La date de début ne peut pas être avant la date actuelle.", "danger")
            return render_template('employé_soumettre_arrêts.html', notifications=notifications, nombre_notifications_non_lues=nombre_notifications_non_lues,photo=session.get('photo'))

        erreur = verifier_toutes_contraintes(employe_email, date_debut, date_fin, "arrêt")
        if erreur:
            flash(erreur, "danger")
            return redirect(url_for('soumettre_demande_arrêt'))

        file = request.files.get('piece_jointe')
        if file and allowed_file(file.filename):
            s3_key = upload_file_to_s3(file, file.filename, folder="arrets")
            filename = s3_key
        else:
            filename = None

        connexion = connect_db()
        cur = connexion.cursor()
        cur.execute("""
            INSERT INTO demandes_arrêt (employe_email, type_maladie, date_debut, date_fin, description, piece_jointe)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (employe_email, type_maladie, date_debut.strftime('%Y-%m-%d'), date_fin.strftime('%Y-%m-%d'), description, filename))
        connexion.commit()
        connexion.close()

        contenu = f"Bonjour,\n\nVotre demande d'arrêt maladie pour {type_maladie} a été déposée avec succès.\n\nCordialement,\nL'équipe RH"
        envoyer_email("Confirmation de dépôt d'arrêt maladie", employe_email, contenu)
        creer_notification(admin_email, f"Une demande d'arrêt de {employe_email} à été deposer", "Arret")

        flash("Votre demande d`arrêt a été déposée avec succès.", "success")
        return redirect(url_for('mes_demandes_d_arrêts'))

    return render_template('employé_soumettre_arrêts.html', notifications=notifications, nombre_notifications_non_lues=nombre_notifications_non_lues,photo=session.get('photo'))

@app.route('/mes_demandes_d_arrêts')
def mes_demandes_d_arrêts():
    """
    L'employé : je regarde mes arrêts maladie.
    """
    if 'email' not in session or session['role'] == "admin":
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))

    employe_email = session['email']
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("SELECT * FROM demandes_arrêt WHERE employe_email = ?", (employe_email,))
    arrets = cur.fetchall()
    connexion.close()

    notifications = récupérer_notifications(employe_email)
    nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(employe_email)
    marquer_notifications_comme_lues(employe_email)

    return render_template(
        'employé_arrêts.html',
        arrets=arrets,
        notifications=notifications,
        nombre_notifications_non_lues=nombre_notifications_non_lues,
        photo=session.get('photo')
    )

@app.route("/modifier_mes_infos", methods=["GET", "POST"])
def modifier_mes_infos():
    """
    L'employé bidouille ses infos (nom, ville, etc.).
    """
    if 'email' not in session or session['role'] == "admin":
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))

    email = session['email']
    notifications = récupérer_notifications(email)
    nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(email)
    marquer_notifications_comme_lues(email)

    connexion = connect_db()
    cur = connexion.cursor()

    cur.execute("SELECT photo FROM utilisateurs WHERE email = ?", (email,))
    old_photo = cur.fetchone()[0]  

    if request.method == "POST":
        nom = request.form['nom']
        prenom = request.form['prenom']
        date_naissance = request.form['date_naissance']
        adresse = request.form['adresse']
        ville = request.form['ville']
        code_postal = request.form['code_postal']
        pays = request.form['pays']
        nationalite = request.form['nationalite']
        telephone = request.form['telephone']
        nouveau_email = request.form['email']
        nouveau_mot_de_passe = request.form.get('nouveau_mot_de_passe')

        if nouveau_email != session['email']:
            if email_existe(nouveau_email):
                flash("Cet email est déjà assigné à un autre employé.", "warning")
                return redirect(url_for('modifier_mes_infos'))

        if nouveau_mot_de_passe:
            if len(nouveau_mot_de_passe) < 8 or \
               not re.search(r'[A-Z]', nouveau_mot_de_passe) or \
               not re.search(r'[0-9]', nouveau_mot_de_passe) or \
               not re.search(r'[!@#$%^&*(),.?":{}|<>]', nouveau_mot_de_passe):
                flash("Le mot de passe doit contenir au moins 8 caractères, une majuscule, un chiffre et un caractère spécial.", "danger")
                return redirect(request.url)
            nouveau_mot_de_passe_hache = ph.hash(nouveau_mot_de_passe)
            cur.execute("UPDATE utilisateurs SET mot_de_passe = ? WHERE email = ?", (nouveau_mot_de_passe_hache, email))

        file = request.files.get('photo')
        if file and allowed_file(file.filename):
            s3_key = upload_file_to_s3(file, file.filename, folder="photo_profile")

            if old_photo and old_photo != "default.png":
                delete_file_from_s3(old_photo)

            cur.execute("""
                UPDATE utilisateurs
                SET nom = ?, prenom = ?,photo = ?,date_naissance = ?, adresse = ?, ville = ?, code_postal = ?, 
                    pays = ?, nationalite = ?, telephone = ?, email = ?
                WHERE email = ?
            """, (nom, prenom, s3_key, date_naissance, adresse, ville, code_postal, pays, nationalite, telephone, nouveau_email, email))

            session['email'] = nouveau_email
            session['photo'] = s3_key
        else:
            cur.execute("""
                UPDATE utilisateurs
                SET nom = ?, prenom = ?, date_naissance = ?, adresse = ?, ville = ?, code_postal = ?, 
                    pays = ?, nationalite = ?, telephone = ?, email = ?
                WHERE email = ?
            """, (nom, prenom, date_naissance, adresse, ville, code_postal, pays, nationalite, telephone, nouveau_email, email))
            session['email'] = nouveau_email

        connexion.commit()
        connexion.close()
        flash("Vos informations ont été mises à jour avec succès.", "success")
        return redirect(url_for('voir_mes_infos'))

    cur.execute("""
        SELECT nom, prenom, date_naissance, email, adresse, ville, code_postal, pays,
               nationalite, telephone, photo
        FROM utilisateurs
        WHERE email = ?
    """, (email,))
    result = cur.fetchone()
    connexion.close()

    return render_template(
        "employé_modification.html",
        result=result,
        notifications=notifications,
        nombre_notifications_non_lues=nombre_notifications_non_lues,
        photo=session.get('photo')
    )

@app.route('/chatbot', methods=['POST'])
def chatbot_endpoint():
    """
    On discute avec un LLM (ou fallback).
    """
    if 'email' not in session:
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))

    user_email = session['email']
    data = request.get_json()
    question = data.get('question', '').strip()

    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("SELECT * FROM utilisateurs WHERE email = ?", (user_email,))
    user_row = cur.fetchone()
    if not user_row:
        connexion.close()
        return jsonify({"answer": "Compte introuvable en base."}), 404

    user_id = user_row["id"]

    cur.execute("""
        SELECT date_debut, date_fin, statut, raison, description
        FROM demandes_congé
        WHERE id_utilisateurs = ?
    """, (user_id,))
    conges_rows = cur.fetchall()

    cur.execute("""
        SELECT type_maladie, date_debut, date_fin, statut, description
        FROM demandes_arrêt
        WHERE employe_email = ?
    """, (user_email,))
    arrets_rows = cur.fetchall()

    cur.execute("""
        SELECT date_teletravail 
        FROM teletravail
        WHERE id_employe = ?
    """, (user_id,))
    teletravail_rows = cur.fetchall()

    connexion.close()

    info_utilisateur = f"""
    ID: {user_row['id']}
    Nom: {user_row['nom']}
    Prénom: {user_row['prenom']}
    Email: {user_row['email']}
    Date de naissance: {user_row['date_naissance']}
    Poste: {user_row['poste']}
    Département: {user_row['departement']}
    Salaire: {user_row['salaire']}
    Solde de congé: {user_row['solde_congé']}
    Téléphone: {user_row['telephone']}
    Adresse: {user_row['adresse']}
    Ville: {user_row['ville']}
    Code postal: {user_row['code_postal']}
    Pays: {user_row['pays']}
    Nationalité: {user_row['nationalite']}
    Sécurité sociale: {user_row['numero_securite_sociale']}
    Date embauche: {user_row['date_embauche']}
    Type de contrat: {user_row['type_contrat']}
    """

    conges_list = []
    for c in conges_rows:
        conge_texte = f"- Congé du {c['date_debut']} au {c['date_fin']}, statut={c['statut']}, raison={c['raison']}, desc={c['description']}"
        conges_list.append(conge_texte)
    info_conges = "\n".join(conges_list) if conges_list else "Aucun congé trouvé."

    arrets_list = []
    for a in arrets_rows:
        arret_texte = f"- Arrêt type={a['type_maladie']}, du {a['date_debut']} au {a['date_fin']}, statut={a['statut']}, desc={a['description']}"
        arrets_list.append(arret_texte)
    info_arrets = "\n".join(arrets_list) if arrets_list else "Aucun arrêt trouvé."

    teletravail_list = []
    for t in teletravail_rows:
        teletravail_texte = f"- Télétravail le {t['date_teletravail']})"
        teletravail_list.append(teletravail_texte)
    info_teletravail = "\n".join(teletravail_list) if teletravail_list else "Aucun jour de télétravail trouvé."

    user_context = {
        "info_utilisateur": info_utilisateur,
        "info_conges": info_conges,
        "info_arrets": info_arrets,
        "info_teletravail": info_teletravail
    }

    answer_text = infer_llm(question, user_context, email_utilisateur=user_email)
    return jsonify({"answer": answer_text})

@app.route('/feedback', methods=["GET", "POST"])
def feedback():
    """
    L'employé dépose un feedback mensuel (une seule fois par mois).
    """
    # Vérification de session
    if 'email' not in session or session.get('role') == "admin":
        flash("Vous devez être connecté comme employé pour accéder à cette page.")
        return redirect(url_for('login'))

    employe_email = session['email']
    user_id = session['id']  # on récupère l'id de l'employé
    notifications = récupérer_notifications(employe_email)
    nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(employe_email)
    marquer_notifications_comme_lues(employe_email)

    # Connexion DB
    connexion = connect_db()
    curseur = connexion.cursor()

    # 1) Vérifier si l'employé a déjà envoyé un feedback ce mois-ci
    # On récupère l'année et le mois courants (ex: '2023-09')
    current_month = datetime.now().strftime('%Y-%m')
    curseur.execute("""
        SELECT COUNT(*) FROM feedback
        WHERE user_id = ?
          AND strftime('%Y-%m', created_at) = ?
    """, (user_id, current_month))
    feedback_count = curseur.fetchone()[0]

    # S'il y a déjà un feedback ce mois-ci, on le bloque
    if feedback_count > 0:
        connexion.close()
        flash("Vous avez déjà soumis votre feedback ce mois-ci. Rendez-vous le mois prochain !", "warning")
        return redirect(url_for('voir_mes_infos'))  # renvoi vers le dashboard employé

    # S'il n'a pas encore fait de feedback ce mois-ci, on gère le GET/POST
    if request.method == "POST":
        # Récupération des champs du formulaire
        rating_env          = request.form.get('rating_env')
        rating_management   = request.form.get('rating_management')
        rating_worklife     = request.form.get('rating_worklife')
        rating_comm         = request.form.get('rating_comm')
        rating_recognition  = request.form.get('rating_recognition')
        rating_training     = request.form.get('rating_training')
        rating_equipment    = request.form.get('rating_equipment')
        rating_team         = request.form.get('rating_team')
        rating_meetings     = request.form.get('rating_meetings')
        rating_transparency = request.form.get('rating_transparency')
        suggestion          = request.form.get('suggestion', '')
        created_at          = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        try:
            curseur.execute("""
                INSERT INTO feedback (
                    user_id,
                    rating_env,
                    rating_management,
                    rating_worklife,
                    rating_comm,
                    rating_recognition,
                    rating_training,
                    rating_equipment,
                    rating_team,
                    rating_meetings,
                    rating_transparency,
                    suggestion,
                    created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                user_id,
                rating_env,
                rating_management,
                rating_worklife,
                rating_comm,
                rating_recognition,
                rating_training,
                rating_equipment,
                rating_team,
                rating_meetings,
                rating_transparency,
                suggestion,
                created_at
            ))
            connexion.commit()
            flash("Merci pour votre feedback !", "success")
        except Exception as e:
            flash(f"Erreur lors de l'enregistrement de votre feedback : {str(e)}", "danger")
        finally:
            connexion.close()
        return redirect(url_for('voir_mes_infos'))  # retour vers le dashboard employé

    # Si on arrive en GET (pas de feedback ce mois-ci) => on affiche le formulaire
    connexion.close()
    return render_template(
        "employé_feedback.html",
        photo=session.get('photo'),
        notifications=notifications,
        nombre_notifications_non_lues=nombre_notifications_non_lues
    )


@app.route('/choisir_teletravail', methods=['GET', 'POST'])
def choisir_teletravail():
    """
    L'employé : il sélectionne ses prochains jours de télétravail, dans la limite autorisée.
    """
    if 'role' not in session or session['role'] == "admin":
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))
    id_employe = session['id']
    employe_email = session['email']
    notifications = récupérer_notifications(employe_email)
    nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(employe_email)
    marquer_notifications_comme_lues(employe_email)

    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("SELECT teletravail_max, is_director FROM utilisateurs WHERE id = ?", (id_employe,))
    user_data = cur.fetchone()
    jours_max_teletravail = user_data[0]
    is_director = user_data[1]

    if request.method == 'POST':
        jours_choisis = request.form.getlist('jours_teletravail')

        if not is_director:
            if len(jours_choisis) != jours_max_teletravail:
                flash(f"Vous devez choisir exactement {jours_max_teletravail} jour(s) de télétravail.", "danger")
                return redirect(url_for('choisir_teletravail'))

        today = datetime.today()
        days_until_next_monday = (7 - today.weekday()) if today.weekday() != 0 else 7
        next_monday = today + timedelta(days=days_until_next_monday)
        next_sunday = next_monday + timedelta(days=7)

        cur.execute("""
            DELETE FROM teletravail 
            WHERE id_employe = ? AND date_teletravail BETWEEN ? AND ?
        """, (id_employe, next_monday.strftime('%Y-%m-%d'), next_sunday.strftime('%Y-%m-%d')))

        for jour in jours_choisis:
            erreur = verifier_toutes_contraintes(id_employe, jour, jour, "teletravail")
            if erreur:
                connexion.close()
                flash(erreur, "danger")
                return redirect(url_for('choisir_teletravail'))
            cur.execute("INSERT INTO teletravail (id_employe, date_teletravail) VALUES (?, ?)", (id_employe, jour))

        connexion.commit()
        connexion.close()
        flash("Vos jours de télétravail ont été soumis avec succès.", "success")
        return redirect(url_for('choisir_teletravail'))
    connexion.commit()
    connexion.close()
    return render_template(
        'employé_télétravail.html',
        jours_max_teletravail=jours_max_teletravail,
        notifications=notifications,
        nombre_notifications_non_lues=nombre_notifications_non_lues,
        photo=session.get('photo')
    )

@app.route('/meeting_invitations', methods=['GET', 'POST'])
def meeting_invitations():
    """
    L'employé : il voit ses invitations de réunion et peut accepter ou refuser.
    """
    if 'email' not in session:
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))

    employee_id = session['id']
    employee_email = session['email']
    notifications = récupérer_notifications(employee_email)
    nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(employee_email)
    marquer_notifications_comme_lues(employee_email)

    connexion = connect_db()
    cur = connexion.cursor()

    if request.method == 'POST':
        meeting_id = request.form['meeting_id']
        response = request.form['response']

        cur.execute("""
            UPDATE réponse_réunion
            SET status = ?
            WHERE meeting_id = ? AND employee_id = ?
        """, (response, meeting_id, employee_id))
        connexion.commit()
        flash('Ta réponse a été enregistrée !', 'success')
        

        cur.execute("""
            SELECT u.email 
            FROM managers m
            JOIN utilisateurs u ON m.id_manager = u.id
            WHERE m.id_supervise = ?
        """, (employee_id,))
        manager_email = cur.fetchone()[0]
        sujet = "Réponse à l'invitation à la réunion"
        contenu = "Bonjour,\n\nL'un de vos employés à répondu à votre invitation.\n\nCordialement,\nL'équipe RH"
        envoyer_email(sujet, manager_email, contenu)
        creer_notification(manager_email, contenu, "Invitation réunion")

    cur.execute("""
        SELECT m.id, m.title, m.date_time, a.status
        FROM réunion m
        JOIN réponse_réunion a ON m.id = a.meeting_id
        WHERE a.employee_id = ?
    """, (employee_id,))
    invitations = cur.fetchall()

    connexion.close()
    return render_template(
        'employé_réunion.html',
        invitations=invitations,
        notifications=notifications,
        nombre_notifications_non_lues=nombre_notifications_non_lues,
        photo=session.get('photo')
    )

# ┌─────────────────────────────────────────────────────────────┐
# │ [LES GROS BOUTONS FINAUX: ON LOG, ON DECRYPTE, ON ENCRYPT] │
# └─────────────────────────────────────────────────────────────┘

log_activities()
decrypt_db()
initialiser_base_de_donnees()
encrypt_db()

if __name__ == "__main__":
    app.run(debug=True)
