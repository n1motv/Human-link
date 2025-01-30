##############################################################
#                  IMPORTS ET CONFIGURATION                  #
##############################################################

import sqlite3, bcrypt, os, uuid, string, random
from flask import Flask, render_template, session, redirect, url_for, request, flash, jsonify
from db_setup import (
    cree_table_notifications,
    cree_table_utilisateurs,
    cree_table_prime,
    cree_compte_admin,
    cree_table_conges,
    connect_db,
    cree_table_managers,
    cree_table_arrets_maladie,
    cree_table_demandes_contact,
    cree_table_réunion,
    cree_table_réponse_réunion,
    cree_table_teletravail
)
from werkzeug.utils import secure_filename
from datetime import datetime, timedelta
from dotenv import load_dotenv
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from forms import LoginForm
from flask_mail import Mail, Message
from itsdangerous import URLSafeTimedSerializer
from apscheduler.schedulers.background import BackgroundScheduler
from hashlib import md5
import re

# Initialisation de l'application Flask + configuration
load_dotenv()
app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY')
app.config['SESSION_PERMANENT'] = False
app.config['TEMPLATES_AUTO_RELOAD'] = True
app.config['DEBUG'] = True

# Configuration pour l'envoi d'emails
app.config['MAIL_SERVER'] = 'smtp.gmail.com'
app.config['MAIL_PORT'] = 587
app.config['MAIL_USE_TLS'] = True
app.config['MAIL_USERNAME'] = os.getenv('MAIL_USERNAME')
app.config['MAIL_PASSWORD'] = os.getenv('MAIL_PASSWORD')

# Adresse email de l'admin
admin_email = app.config['MAIL_USERNAME']

# Limitation des tentatives de connexion
limiter = Limiter(get_remote_address, app=app)

# Configuration pour le téléchargement de fichiers
ALLOWED_EXTENSIONS = {'pdf', 'png', 'jpg', 'jpeg', 'gif'}

# Configuration pour le stockage dans le coffre-fort
BASE_COFFRE_FORT = "static/coffre_fort/"
ALLOWED_EXTENSIONS_DOCUMENTS = {'pdf'}

# Création d'un objet Mail
mail = Mail(app)

##############################################################
#         FONCTIONS GLOBALES ET UTILITAIRES (HELPERS)        #
##############################################################

def ajouter_conge_mensuel():
    mois_actuel = datetime.now().strftime("%Y-%m")  # Format: "2023-10"
    
    connexion = connect_db()
    curseur = connexion.cursor()
    curseur.execute("SELECT id, solde_congé, dernier_mois_maj FROM utilisateurs")
    employes = curseur.fetchall()
    
    for employe in employes:
        employe_id, solde_congé, dernier_mois_maj = employe
        if dernier_mois_maj != mois_actuel:
            nouveau_solde_conge = solde_congé + 2.5
            curseur.execute("""
                UPDATE utilisateurs
                SET solde_congé = ?, dernier_mois_maj = ?
                WHERE id = ?
            """, (nouveau_solde_conge, mois_actuel, employe_id))
            print(f"Congé mis à jour pour l'utilisateur ID {employe_id}: {nouveau_solde_conge} jours")
        else:
            print(f"Pas de mise à jour pour l'utilisateur ID {employe_id}, mois déjà mis à jour")
    
    connexion.commit()
    connexion.close()
    print("Mise à jour mensuelle des congés terminée.")


def creation_upload_dossier(nom):
    """
    Crée un dossier pour l'upload si celui-ci n'existe pas.
    Retourne le chemin complet.
    """
    BASE_UPLOAD_FOLDER = 'static/uploads/'
    full_path = os.path.join(BASE_UPLOAD_FOLDER, nom)
    app.config['UPLOAD_FOLDER'] = full_path
    app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024
    if not os.path.exists(app.config['UPLOAD_FOLDER']):
        os.makedirs(app.config['UPLOAD_FOLDER'])
    return full_path

def allowed_file(filename):
    """
    Vérifie si un fichier possède une extension autorisée (images et pdf).
    """
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def allowed_file_document(filename):
    """
    Vérifie si un fichier est un document PDF.
    """
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS_DOCUMENTS

def generer_id():
    """
    Génère un ID personnalisé (ex: 012345A).
    """
    numeros = ''.join(random.choices(string.digits, k=5))
    lettre = random.choice(string.ascii_uppercase)
    return f"0{numeros}{lettre}"

def id_existe(id_employe):
    """
    Vérifie si un identifiant employé existe déjà dans la base.
    """
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("SELECT 1 FROM utilisateurs WHERE id = ?", (id_employe,))
    return cur.fetchone() is not None

def email_existe(email):
    """
    Vérifie si un email existe déjà dans la table utilisateurs.
    """
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("SELECT 1 FROM utilisateurs WHERE email = ?", (email,))
    existe = cur.fetchone() is not None
    connexion.close()
    return existe

def generer_mot_de_passe(longueur=12):
    """
    Génère un mot de passe aléatoire respectant certaines règles de sécurité.
    """
    if longueur < 8:
        raise ValueError("Le mot de passe doit avoir au moins 8 caractères.")

    caracteres = string.ascii_letters + string.digits + "!@#$%^&*()-_+="
    mot_de_passe = ''.join(random.choices(caracteres, k=longueur))

    # Vérifie la présence d'un chiffre, d'une majuscule, d'une minuscule et d'un caractère spécial
    if not any(c.isdigit() for c in mot_de_passe):
        mot_de_passe += random.choice(string.digits)
    if not any(c.islower() for c in mot_de_passe):
        mot_de_passe += random.choice(string.ascii_lowercase)
    if not any(c.isupper() for c in mot_de_passe):
        mot_de_passe += random.choice(string.ascii_uppercase)
    if not any(c in "!@#$%^&*()-_+=" for c in mot_de_passe):
        mot_de_passe += random.choice("!@#$%^&*()-_+=")

    return ''.join(random.sample(mot_de_passe, len(mot_de_passe)))

def envoyer_email(sujet, destinataire, contenu):
    """
    Envoie un email avec le sujet et le contenu spécifiés au destinataire.
    """
    message = Message(
        subject=sujet,
        body=contenu,
        sender=app.config['MAIL_USERNAME'],  # Configuré via les variables d'environnement
        recipients=[destinataire]
    )
    mail.send(message)
    print(f"Email envoyé à {destinataire}")

serializer = URLSafeTimedSerializer(app.secret_key)

def creer_notification(email, message, type_notification):
    """
    Crée une notification pour un utilisateur dans la base de données.
    Limite à 5 notifications par utilisateur (supprime la plus ancienne).
    """
    try:
        connexion = connect_db()
        cur = connexion.cursor()

        # Vérifier si l'utilisateur existe
        cur.execute("SELECT 1 FROM utilisateurs WHERE email = ?", (email,))
        if not cur.fetchone():
            print(f"Utilisateur introuvable : {email}")
            return False

        # Insérer la nouvelle notification
        date_creation = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        cur.execute("""
            INSERT INTO notifications (email, message, type, created_at, is_read)
            VALUES (?, ?, ?, ?, 0)
        """, (email, message, type_notification, date_creation))

        # Supprimer les anciennes notifications si plus de 5
        cur.execute("""
            DELETE FROM notifications
            WHERE email = ?
            AND id NOT IN (
                SELECT id FROM notifications
                WHERE email = ?
                ORDER BY created_at DESC
                LIMIT 5
            )
        """, (email, email))

        connexion.commit()
        print(f"Notification créée pour {email}.")
        return True

    except sqlite3.Error as e:
        print(f"Erreur lors de la création de la notification : {e}")
        return False

    finally:
        if 'connexion' in locals():
            connexion.close()

def récupérer_notifications(email):
    """
    Récupère toutes les notifications pour un utilisateur, triées par date de création desc.
    """
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        SELECT id, message, type, created_at, is_read
        FROM notifications
        WHERE email = ?
        ORDER BY created_at DESC
    """, (email,))
    notifications = cur.fetchall()
    connexion.close()

    return [
        {
            'id': n[0],
            'message': n[1],
            'type': n[2],
            'created_at': datetime.strptime(n[3], '%Y-%m-%d %H:%M:%S') if isinstance(n[3], str) else n[3],
            'is_read': n[4]
        }
        for n in notifications
    ]

def récupérer_nombre_notifications_non_lues(email):
    """
    Récupère le nombre de notifications non lues pour un utilisateur.
    """
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        SELECT COUNT(*)
        FROM notifications
        WHERE email = ? AND is_read = 0
    """, (email,))
    count = cur.fetchone()[0]
    connexion.close()
    return count

def marquer_notifications_comme_lues(email):
    """
    Marque toutes les notifications d'un utilisateur comme lues.
    """
    connexion = connect_db()
    try:
        cur = connexion.cursor()
        cur.execute("""
            UPDATE notifications
            SET is_read = 1
            WHERE email = ?
        """, (email,))
        connexion.commit()
    except sqlite3.OperationalError as e:
        print(f"Erreur SQLite: {e}")
    finally:
        connexion.close()


def compter_jours_de_conge(date_debut, date_fin):
    """
    Compte le nombre de jours ouvrables (lundi-vendredi) entre deux dates incluses.
    """
    jours_conge = 0
    date_courante = date_debut
    while date_courante <= date_fin:
        if date_courante.weekday() < 5:  # Exclure les week-ends
            jours_conge += 1
        date_courante += timedelta(days=1)
    return jours_conge

def generer_couleur_employe(email):
    """
    Génère une couleur pastel unique basée sur un hash de l'email.
    """
    hash_email = md5(email.encode()).hexdigest()
    hue = int(hash_email[:8], 16) % 360
    return f'hsl({hue}, 30%, 50%)'

def verifier_toutes_contraintes(id_employe, date_debut, date_fin, type_demande):
    """
    Vérifie si une demande (congé, arrêt maladie, télétravail) chevauche déjà un autre événement.
    Empêche également la superposition avec d'autres types d'absences (ex: arrêts).
    """
    connexion = connect_db()
    cur = connexion.cursor()

    # Si la variable id_employe est un email pour les arrêts maladie, on récupère l'id ou inversement
    # selon ce qui est pertinent.
    # Congé
    if type_demande == "congé":
        # Vérifier chevauchement avec un autre congé
        cur.execute("""
            SELECT id FROM demandes_congé
            WHERE id_utilisateurs = ? AND (
                (? BETWEEN date_debut AND date_fin) OR
                (? BETWEEN date_debut AND date_fin) OR
                (date_debut BETWEEN ? AND ?) OR
                (date_fin BETWEEN ? AND ?)
            )
        """, (id_employe, date_debut, date_fin, date_debut, date_fin, date_debut, date_fin))
        if cur.fetchone():
            connexion.close()
            return "Vous ne pouvez pas soumettre un congé qui chevauche un autre congé."

        cur.execute("""SELECT email FROM utilisateurs WHERE id = ?""", (id_employe,))
        email_employe = cur.fetchone()[0]

        # Vérifier chevauchement avec un arrêt maladie
        cur.execute("""
            SELECT id FROM demandes_arrêt
            WHERE employe_email = ? AND (
                (? BETWEEN date_debut AND date_fin) OR
                (? BETWEEN date_debut AND date_fin) OR
                (date_debut BETWEEN ? AND ?) OR
                (date_fin BETWEEN ? AND ?)
            )
        """, (email_employe, date_debut, date_fin, date_debut, date_fin, date_debut, date_fin))
        if cur.fetchone():
            connexion.close()
            return "Vous ne pouvez pas soumettre un congé qui chevauche un arrêt maladie."

    # Arrêt maladie
    elif type_demande == "arrêt":
        # Vérifier chevauchement avec un autre arrêt maladie
        cur.execute("""
            SELECT id FROM demandes_arrêt
            WHERE employe_email = ? AND (
                (? BETWEEN date_debut AND date_fin) OR
                (? BETWEEN date_debut AND date_fin) OR
                (date_debut BETWEEN ? AND ?) OR
                (date_fin BETWEEN ? AND ?)
            )
        """, (id_employe, date_debut, date_fin, date_debut, date_fin, date_debut, date_fin))
        if cur.fetchone():
            connexion.close()
            return "Vous ne pouvez pas soumettre un arrêt maladie qui chevauche un autre arrêt maladie."

        cur.execute("""SELECT id FROM utilisateurs WHERE email = ?""", (id_employe,))
        real_id = cur.fetchone()[0]

        # Vérifier chevauchement avec un congé
        cur.execute("""
            SELECT id FROM demandes_congé
            WHERE id_utilisateurs = ? AND (
                (? BETWEEN date_debut AND date_fin) OR
                (? BETWEEN date_debut AND date_fin) OR
                (date_debut BETWEEN ? AND ?) OR
                (date_fin BETWEEN ? AND ?)
            )
        """, (real_id, date_debut, date_fin, date_debut, date_fin, date_debut, date_fin))
        if cur.fetchone():
            connexion.close()
            return "Vous ne pouvez pas soumettre un arrêt maladie qui chevauche un congé."

    # Télétravail
    elif type_demande == "teletravail":
        # Vérifier chevauchement avec un congé accepté
        cur.execute("""
            SELECT id FROM demandes_congé
            WHERE id_utilisateurs = ? AND statut = 'accepte' AND (
                (? BETWEEN date_debut AND date_fin) OR
                (? BETWEEN date_debut AND date_fin) OR
                (date_debut BETWEEN ? AND ?) OR
                (date_fin BETWEEN ? AND ?)
            )
        """, (id_employe, date_debut, date_fin, date_debut, date_fin, date_debut, date_fin))
        if cur.fetchone():
            connexion.close()
            return "Vous ne pouvez pas soumettre un jour de télétravail qui chevauche un congé."

        # Vérifier chevauchement avec un arrêt maladie accepté
        cur.execute("""SELECT email FROM utilisateurs WHERE id = ?""", (id_employe,))
        email_employe = cur.fetchone()[0]
        cur.execute("""
            SELECT id FROM demandes_arrêt
            WHERE employe_email = ? AND statut = 'accepte' AND (
                (? BETWEEN date_debut AND date_fin) OR
                (? BETWEEN date_debut AND date_fin) OR
                (date_debut BETWEEN ? AND ?) OR
                (date_fin BETWEEN ? AND ?)
            )
        """, (email_employe, date_debut, date_fin, date_debut, date_fin, date_debut, date_fin))
        if cur.fetchone():
            connexion.close()
            return "Vous ne pouvez pas soumettre un jour de télétravail qui chevauche un arrêt maladie."
    connexion.close()
    return None

def modifier_mot_de_passe(email, nouveau_mot_de_passe):
    """
    Modifie le mot de passe d'un employé identifié par son email.
    """
    if len(nouveau_mot_de_passe) < 8 or \
       not re.search(r'[A-Z]', nouveau_mot_de_passe) or \
       not re.search(r'[0-9]', nouveau_mot_de_passe) or \
       not re.search(r'[!@#$%^&*(),.?":{}|<>]', nouveau_mot_de_passe):
        return "Le mot de passe doit contenir au moins 8 caractères, une majuscule, un chiffre et un caractère spécial."

    mot_de_passe_hache = bcrypt.hashpw(nouveau_mot_de_passe.encode('utf-8'), bcrypt.gensalt())
    connexion = connect_db()
    cur = connexion.cursor()

    try:
        # Vérifier si l'e-mail existe
        cur.execute("SELECT id FROM utilisateurs WHERE email = ?", (email,))
        employe = cur.fetchone()
        if not employe:
            return "L'adresse e-mail fournie n'existe pas dans la base de données."

        cur.execute("""
            UPDATE utilisateurs
            SET mot_de_passe = ?
            WHERE email = ?
        """, (mot_de_passe_hache, email))
        connexion.commit()
        return "Le mot de passe a été mis à jour avec succès."

    except Exception as e:
        connexion.rollback()
        return f"Une erreur est survenue : {str(e)}"

    finally:
        connexion.close()

##############################################################
#         INITIALISATION DE LA BASE DE DONNÉES AU DEMARRAGE  #
##############################################################

def initialiser_base_de_donnees():
    """
    Vérifie et crée toutes les tables nécessaires au fonctionnement de l'application.
    Crée également le compte admin si non existant et ajoute automatiquement des jours de congé mensuel.
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

##############################################################
#                    FILTRES DE TEMPLATES                    #
##############################################################

@app.template_filter('format_datetime')
def format_datetime(value, format='%d-%m-%Y %H:%M'):
    """
    Filtre Jinja pour formater la date et l'heure.
    """
    if isinstance(value, datetime):
        return value.strftime(format)
    try:
        value = datetime.strptime(value, '%Y-%m-%d %H:%M:%S')
        return value.strftime(format)
    except Exception:
        return value

##############################################################
#                       ROUTES COMMUNES                      #
##############################################################

@app.route("/")
def charging():
    """
    Page de chargement qui redirige vers /login.
    """
    return render_template('loading.html', redirect_url=url_for('login'))

@app.route("/login", methods=["GET", "POST"])
@limiter.limit("5 per minute")
def login():
    """
    Gère la connexion des utilisateurs (admin, manager, employe).
    Utilise un formulaire WTForms (LoginForm).
    """
    form = LoginForm()
    if form.validate_on_submit():
        email = form.email.data
        mot_de_passe = form.mot_de_passe.data

        # Vérifier dans la base de données si l'email existe
        connexion = connect_db()
        curseur = connexion.cursor()
        curseur.execute("""
            SELECT id, email, mot_de_passe, role FROM utilisateurs WHERE email = ?
        """, (email,))
        utilisateur = curseur.fetchone()
        connexion.close()

        # Vérification du mot de passe avec bcrypt
        if utilisateur and bcrypt.checkpw(mot_de_passe.encode('utf-8'), utilisateur[2]):
            session['email'] = email
            session['role'] = 'admin' if email == admin_email else 'employe'
            if utilisateur[3] == 'manager':
                session['role'] = 'manager'

            session['id'] = utilisateur[0]
            session['email'] = utilisateur[1]

            # Redirection en fonction du rôle
            if session['role'] == 'admin':
                return render_template('loading.html', redirect_url=url_for('admin_dashboard'))
            elif session['role'] == 'manager':
                return render_template('loading.html', redirect_url=url_for('manager_dashboard'))
            else:
                return render_template('loading.html', redirect_url=url_for('voir_mes_infos'))
        else:
            flash("Identifiants incorrects", "danger")
    return render_template("login.html", form=form)

@app.route("/logout")
def logout():
    """
    Déconnecte l'utilisateur en vidant la session.
    """
    session.clear()
    return render_template('loading.html', redirect_url=url_for('login'))

@app.route('/contact', methods=['GET', 'POST'])
def contact():
    """
    Permet à un visiteur ou un utilisateur connecté d'envoyer une demande de contact.
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
            # Récupérer les informations depuis la base
            connexion = connect_db()
            cur = connexion.cursor()
            cur.execute("""SELECT nom, prenom, telephone FROM utilisateurs WHERE id = ? """, (id_utilisateur,))
            user_info = cur.fetchone()
            if user_info:
                nom, prenom, telephone = user_info
            connexion.close()

        # Sauvegarder dans la base de données
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

    # Pour un utilisateur connecté : afficher le formulaire + notifications
    if 'email' in session:
        email = session['email']
        notifications = récupérer_notifications(email)
        nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(email)
        marquer_notifications_comme_lues(email)
        return render_template(
            'contact.html',
            notifications=notifications,
            nombre_notifications_non_lues=nombre_notifications_non_lues
        )
    else:
        # Pour un visiteur non connecté
        return render_template('contact.html')

@app.route('/reset_password', methods=["GET", "POST"])
def reset_password():

    return render_template('récupération_mot_de_passe.html')

@app.route('/envoyer_email_reinitialisation', methods=["POST"])
def envoyer_email_reinitialisation():
    """
    Route appelée en AJAX pour envoyer l'e-mail de réinitialisation.
    Utilisée par l'admin et les employés.
    """
    email = request.json.get('email')
    if not email:
        return jsonify({'success': False, 'error': 'Email non fourni'}), 400

    # Vérifier si l'email existe dans la base
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("SELECT id FROM utilisateurs WHERE email = ?", (email,))
    utilisateur = cur.fetchone()
    connexion.close()

    if not utilisateur:
        return jsonify({'success': False, 'error': 'Email non trouvé'}), 404

    # Générer un token et le lien de réinitialisation
    token = serializer.dumps(email, salt="reset-password")
    lien_reinitialisation = f"https://hr-management2.onrender.com/update_password?token={token}"
    
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
    Page pour mettre à jour le mot de passe après avoir cliqué sur le lien reçu par email.
    Le token est vérifié, puis on propose un formulaire de nouveau mot de passe.
    """
    token = request.args.get('token')
    try:
        email = serializer.loads(token, salt="reset-password", max_age=1800)
    except Exception as e:
        flash("Le lien de réinitialisation est invalide ou expiré.", "danger")
        return redirect(url_for('reset_password'))

    if request.method == 'POST':
        new_password = request.form['new_password']
        # Vérifier la complexité
        if len(new_password) < 8 or \
           not re.search(r'[A-Z]', new_password) or \
           not re.search(r'[0-9]', new_password) or \
           not re.search(r'[!@#$%^&*(),.?":{}|<>]', new_password):
            flash("Le mot de passe doit contenir au moins 8 caractères, une majuscule, un chiffre et un caractère spécial.", "danger")
            return redirect(request.url)

        hashed_password = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt())

        # Mettre à jour le mot de passe
        connexion = connect_db()
        cur = connexion.cursor()
        cur.execute("""
            UPDATE utilisateurs
            SET mot_de_passe = ?
            WHERE email = ?
        """, (hashed_password, email))
        connexion.commit()
        connexion.close()

        flash('Votre mot de passe a été mis à jour avec succès.', 'success')
        return redirect(url_for('login'))

    return render_template('modifié_mot_de_passe.html', email=email)

@app.route('/mark_notifications_as_read', methods=['POST'])
def mark_notifications_as_read():
    """
    Marque toutes les notifications comme lues pour l'utilisateur connecté.
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
    Supprime une notification spécifique par son ID.
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

##############################################################
#                     ROUTES ADMINISTRATEUR                  #
##############################################################

@app.route('/admin_dashboard')
def admin_dashboard():
    """
    Tableau de bord de l'administrateur.
    Affiche des statistiques (nombre d'employés, départements, salaire moyen, etc.).
    """
    if 'role' not in session or session['role'] != 'admin':
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))

    connexion = connect_db()
    cur = connexion.cursor()

    # Total des employés
    cur.execute("""
        SELECT COUNT(*) FROM utilisateurs 
        WHERE email != ?
    """,(admin_email,))
    total_employes = cur.fetchone()[0]

    # Total départements
    cur.execute("""
        SELECT COUNT(DISTINCT(departement)) 
        FROM utilisateurs 
        WHERE email != ?
    """,(admin_email,))
    total_departements = cur.fetchone()[0]

    # Total congés acceptés
    cur.execute("SELECT COUNT(*) FROM demandes_congé WHERE statut = 'accepte'")
    conges_acceptes = cur.fetchone()[0]

    # Salaire moyen
    cur.execute("""
        SELECT AVG(salaire) 
        FROM utilisateurs 
        WHERE email != ?
    """,(admin_email,))
    result = cur.fetchone()[0]
    salaire_moyen = round(result, 2) if result is not None else 0.00

    # Congés acceptés par mois
    cur.execute("""
        SELECT strftime('%m', date_debut) AS mois, COUNT(*) 
        FROM demandes_congé 
        WHERE statut = 'accepte' 
        GROUP BY mois
    """)
    conges_par_mois_data = cur.fetchall()
    mois_labels = [row[0] for row in conges_par_mois_data]
    conges_par_mois = [row[1] for row in conges_par_mois_data]

    # Nombre de personnes sur site aujourd'hui
    today = datetime.now().strftime('%Y-%m-%d')
    cur.execute("""
        SELECT COUNT(*) FROM utilisateurs u
        WHERE email != ? 
        AND u.id NOT IN (
            SELECT t.id_employe FROM teletravail t WHERE t.date_teletravail = ?
        ) 
    """, (admin_email,today,))
    personnes_sur_site = cur.fetchone()[0]

    # Nombre de personnes en télétravail aujourd'hui
    cur.execute("""
        SELECT COUNT(*) FROM teletravail WHERE date_teletravail = ?
    """, (today,))
    personnes_teletravail = cur.fetchone()[0]

    # Congés acceptés par jour
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

    # Nombre d'employés par département
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
    )

@app.route("/afficher_employers")
def afficher_employés():
    """
    Affiche la liste des employés pour l'administrateur.
    """
    if 'role' not in session or session['role'] != 'admin':
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))
    connexion = connect_db()
    connexion.row_factory = None
    curseur = connexion.cursor()
    curseur.execute("""
        SELECT nom, prenom, date_naissance, poste, departement, email, solde_congé, salaire,id,role , photo,sexualite,telephone,adresse,ville,code_postal,pays,nationalite,numero_securite_sociale,date_embauche,type_contrat  FROM utilisateurs WHERE id != "None" ORDER BY id
    """)
    employees=  curseur.fetchall()
    notifications = récupérer_notifications(admin_email)
    nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(admin_email)
    marquer_notifications_comme_lues(admin_email)

    return render_template(
        "admin_employés.html",
        employees=employees,
        role=session.get('role'),
        notifications=notifications,
        nombre_notifications_non_lues=nombre_notifications_non_lues
    )

@app.route("/ajouter_employe", methods=["GET", "POST"])
def ajouter_employe_page():
    """
    Permet à l'administrateur (ou manager) d'ajouter un nouvel employé.
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
            # Vérifier l'âge (au moins 17 ans)
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
            mot_de_passe_hash = bcrypt.hashpw(mot_de_passe.encode('utf-8'), bcrypt.gensalt())
            id_employe = generer_id()
            while id_existe(id_employe):
                id_employe = generer_id()

            file = request.files['photo']
            if file and allowed_file(file.filename):
                filename = secure_filename(file.filename)
                extension = filename.rsplit('.', 1)[1].lower()
                unique_name = f"photo_{uuid.uuid4().hex}.{extension}"
                upload_folder = creation_upload_dossier("photo_profile")

                while os.path.exists(os.path.join(upload_folder, unique_name)):
                    unique_name = f"photo_{uuid.uuid4().hex}.{extension}"

                file.save(os.path.join(upload_folder, unique_name))
                file_name_only = unique_name
            else:
                file_name_only = 'default.png'

            curseur.execute("""
                    INSERT INTO utilisateurs (id,nom, prenom, date_naissance, poste, departement, email, mot_de_passe, solde_congé, salaire,role,photo,sexualite,telephone,adresse,ville,code_postal,pays,nationalite,numero_securite_sociale,date_embauche,type_contrat)
                    VALUES (?,?, ?, ?, ?, ?, ?, ?, ?, ?,?,?,?, ?, ?, ?, ?, ?, ?, ?,?,?)
                """, (id_employe,nom, prenom, date_naissance, poste, departement, email, mot_de_passe_hash, solde_congé, salaire,role,file_name_only,sexualite, telephone, adresse, 
                ville, code_postal, pays, nationalite, numero_securite_sociale, date_embauche, type_contrat))
            connexion.commit()
            connexion.close()
            # Envoyer l'e-mail de félicitations
            sujet_felicitations = "Bienvenue chez notre entreprise !"
            contenu_felicitations = f"""
            Bonjour {prenom} {nom},

            Félicitations pour votre intégration au sein de notre entreprise. Nous sommes ravis de vous accueillir dans notre équipe.

            Cordialement,
            L'équipe RH
            """
            envoyer_email(sujet_felicitations, email, contenu_felicitations)

            # Envoyer l'e-mail avec le mot de passe
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

            return redirect(url_for('afficher_employés'))

    notifications = récupérer_notifications(admin_email)
    nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(admin_email)
    marquer_notifications_comme_lues(admin_email)

    return render_template(
        "admin_ajouter_employe.html",
        erreur=erreur,
        notifications=notifications,
        nombre_notifications_non_lues=nombre_notifications_non_lues
    )

@app.route("/afficher_demandes_congé")
def afficher_demandes_congé():
    """
    Affiche toutes les demandes de congé pour l'administrateur ou le manager.
    - L'admin voit toutes les demandes validées par le manager.
    - Le manager voit les demandes des employés qu'il supervise.
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
            nombre_notifications_non_lues=nombre_notifications_non_lues
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
            nombre_notifications_non_lues=nombre_notifications_non_lues
        )
    else:
        return redirect(url_for('login'))

@app.route("/repondre_conge/<int:id>", methods=["POST"])
def répondre_congés(id):
    """
    Permet à un manager ou un admin de répondre à une demande de congé (accepter/refuser).
    Met à jour les statuts et notifie l'employé concerné.
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

        # Rôle manager
        if role == 'manager':
            if statut == 'accepte':
                curseur.execute("""
                    UPDATE demandes_congé SET statut_manager = 'accepte'
                    WHERE id = ?
                """, (id,))
                contenu = f"Une demande de congé de l'employé {id_employe} a été acceptée par le manager et requiert votre approbation."
                notifications.append((admin_email, contenu, "Congé"))

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

        # Rôle admin
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
                    # Supprimer le télétravail pour la période
                    curseur.execute("""SELECT date_debut, date_fin FROM demandes_arrêt WHERE id =  ? """,(id,))
                    result = curseur.fetchone()
                    if result:
                        date_debut, date_fin = result
                    curseur.execute("""
                        DELETE FROM teletravail
                        WHERE id_employe = ? AND date_teletravail BETWEEN ? AND ?
                    """, (id_employe, date_debut, date_fin))

                    contenu = f"Bonjour,\n\nVotre demande de congé a été acceptée par l'administrateur.\n\nCordialement,\nL'équipe RH"
                    sujet = "Acceptation de votre demande de congé"
                    notifications.append((email_employe, contenu, "Congé"))
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

@app.route("/calendrier_congés")
def calendrier_congés():
    """
    Afficher le calendrier des congés acceptés avec une couleur unique par employé.
    """
    if 'role' not in session or session['role'] not in ['admin', 'manager']:
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))

    connexion = connect_db()
    cur = connexion.cursor()

    if session['role'] == 'admin':
        notifications = récupérer_notifications("admin@gmail.com")
        nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues("admin@gmail.com")
        # Marquer les notifications comme lues après les avoir affichées
        marquer_notifications_comme_lues("admin@gmail.com")
        cur.execute("""
            SELECT dc.id_utilisateurs, dc.date_debut, dc.date_fin, dc.description, u.nom, u.prenom, u.email 
            FROM demandes_congé dc
            JOIN utilisateurs u ON dc.id_utilisateurs = u.id
            WHERE dc.statut = 'accepte'
        """)

    elif session['role'] == 'manager':
        manager_id = session['id']
        cur.execute("""SELECT email FROM utilisateurs WHERE id=?""",(manager_id,))
        manager_email=cur.fetchone()[0]
        notifications = récupérer_notifications(manager_email)
        nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(manager_email)
        # Marquer les notifications comme lues après les avoir affichées
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

    # Construire le dictionnaire des congés par jour
    conges_par_jour = {}
    couleurs_employes = {}

    for conge in conges_acceptes:
        id_utilisateur, date_debut, date_fin, description, nom, prenom,email = conge

        # Générer une couleur unique par employé
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
        notifications = notifications,
        nombre_notifications_non_lues =nombre_notifications_non_lues            
        )


@app.route("/supprimer_employe/<string:id>", methods=["POST"])
def supprimer_employe(id):
    """
    Supprime un employé, ainsi que ses assignations comme manager ou supervisé.
    Accessible uniquement à l'admin.
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
    Met à jour les informations d'un employé (pour l'admin).
    """
    if 'role' not in session or session['role'] != 'admin':
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))
    connexion = connect_db()
    curseur = connexion.cursor()

    # Récupérer l'ancienne photo avant la mise à jour
    curseur.execute("SELECT photo FROM utilisateurs WHERE id = ?", (id,))
    old_photo = curseur.fetchone()[0]  

    champs_a_mettre_a_jour = [
        ("nom", request.form['nom']),
        ("prenom", request.form['prenom']),
        ("date_naissance", request.form['date_naissance']),
        ("poste", request.form['poste']),
        ("departement", request.form['departement']),
        ("salaire", request.form['salaire']),
        ("solde_congé", request.form['solde_congé']),
        ("role", request.form['role']),
        ("sexualite", request.form['sexualite']),
        ("telephone", request.form['telephone']),
        ("adresse", request.form['adresse']),
        ("ville", request.form['ville']),
        ("code_postal", request.form['code_postal']),
        ("pays", request.form['pays']),
        ("nationalite", request.form['nationalite']),
        ("numero_securite_sociale", request.form['numero_securite_sociale']),
        ("date_embauche", request.form['date_embauche']),
        ("type_contrat", request.form['type_contrat'])
    ]

    file = request.files.get('photo')
    if file and allowed_file(file.filename):
        filename = secure_filename(file.filename)
        file.save(os.path.join('static/uploads/photo_profile', filename))

        # Supprimer l'ancienne photo si elle existe et n'est pas la photo par défaut
        if old_photo and old_photo != "default.png":
            old_photo_path = os.path.join('static/uploads/photo_profile', old_photo)
            if os.path.exists(old_photo_path):
                os.remove(old_photo_path)

        champs_a_mettre_a_jour.append(("photo", filename))

    mot_de_passe = request.form.get('mot_de_passe')
    if mot_de_passe:
        mot_de_passe_hash = bcrypt.hashpw(mot_de_passe.encode('utf-8'), bcrypt.gensalt())
        champs_a_mettre_a_jour.append(("mot_de_passe", mot_de_passe_hash))

    set_clause = ", ".join([f"{champ} = ?" for champ, _ in champs_a_mettre_a_jour])
    valeurs = [valeur for _, valeur in champs_a_mettre_a_jour]
    valeurs.append(id)

    curseur.execute(f"UPDATE utilisateurs SET {set_clause} WHERE id = ?", valeurs)
    connexion.commit()
    connexion.close()

    return redirect(url_for('afficher_employés'))


@app.route('/admin_demandes_contact')
def admin_demandes_contact():
    """
    Affiche toutes les demandes de contact pour l'administrateur.
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
    Affiche les demandes d'arrêt maladie pour l'admin et permet de les accepter ou refuser.
    """
    if 'role' not in session or session['role'] != 'admin':
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))
    if request.method == 'POST':
        id = request.form['id']
        statut = request.form['statut']
        motif_refus = request.form.get('motif_refus', None)

        connexion = connect_db()
        cur = connexion.cursor()
        cur.execute("SELECT employe_email FROM demandes_arrêt WHERE id = ?", (id,))
        result = cur.fetchone()
        if not result:
            return redirect(url_for('afficher_demandes_arrêts'))
        employe_email = result[0]

        if statut == 'refuse':
            cur.execute("""
                UPDATE demandes_arrêt
                SET statut = ?, motif_refus = ?
                WHERE id = ?
            """, (statut, motif_refus, id))
            contenu = f"Bonjour,\n\nVotre demande d'arrêt maladie a été refusée pour le motif suivant : {motif_refus}.\n\nCordialement,\nL'équipe RH"
            sujet="Refus de demande d'arrêt"
        else:
            cur.execute("""
                UPDATE demandes_arrêt
                SET statut = ?, motif_refus = NULL
                WHERE id = ?
            """, (statut, id))
            # Supprimer le télétravail pour la période
            cur.execute("""SELECT id FROM utilisateurs WHERE email= ?""", (employe_email,))
            id_employe=cur.fetchone()[0]
            cur.execute("""SELECT date_debut, date_fin FROM demandes_arrêt WHERE id = ?""", (id,))
            date_debut, date_fin = cur.fetchone()
            cur.execute("""
                DELETE FROM teletravail
                WHERE id_employe = ? AND date_teletravail BETWEEN ? AND ?
            """, (id_employe, date_debut, date_fin))
            contenu = "Bonjour,\n\nVotre demande d'arrêt maladie a été acceptée.\n\nCordialement,\nL'équipe RH"
            sujet="Acceptation de demande d'arrêt"

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
        nombre_notifications_non_lues=nombre_notifications_non_lues
    )

@app.route('/afficher_demandes_prime')
def afficher_demandes_prime():
    """
    Affiche toutes les demandes de prime pour l'administrateur.
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
        nombre_notifications_non_lues=nombre_notifications_non_lues
    )

@app.route('/traiter_demande_prime/<int:id>', methods=['POST'])
def traiter_demande_prime(id):
    """
    Permet à l'administrateur de traiter (accepter/refuser) une demande de prime.
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
    Espace de stockage de documents (contrats, bulletins, etc.).
    - L'admin peut sélectionner un employé pour visualiser ses documents.
    - L'employé connecté voit ses propres documents uniquement.
    """
    if 'email' not in session:
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))

    connexion = connect_db()
    cur = connexion.cursor()

    # Si l'utilisateur est admin
    if session.get('role') == 'admin':
        if request.method == 'POST':
            employe_id = request.form['employe_id']
            cur.execute("SELECT email FROM utilisateurs WHERE id = ?", (employe_id,))
            employe_email = cur.fetchone()[0]
            cur.execute("SELECT nom, prenom FROM utilisateurs WHERE id = ?", (employe_id,))
            employe = cur.fetchone()

            if employe:
                nom, prenom = employe
                chemin_bulletins = os.path.join(BASE_COFFRE_FORT, "bulletins", f"{nom}{prenom}")
                chemin_contrats = os.path.join(BASE_COFFRE_FORT, "contrats", f"{nom}{prenom}")
                chemin_autres = os.path.join(BASE_COFFRE_FORT, "autres", f"{nom}{prenom}")

                bulletins = os.listdir(chemin_bulletins) if os.path.exists(chemin_bulletins) else []
                contrats = os.listdir(chemin_contrats) if os.path.exists(chemin_contrats) else []
                autres = os.listdir(chemin_autres) if os.path.exists(chemin_autres) else []

                notifications = récupérer_notifications(admin_email)
                nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(admin_email)
                marquer_notifications_comme_lues(admin_email)

                return render_template(
                    'coffre_fort.html',
                    bulletins=bulletins,
                    contrats=contrats,
                    autres=autres,
                    nom=nom,
                    prenom=prenom,
                    employe_id=employe_id,
                    role=session.get('role'),
                    notifications=notifications,
                    nombre_notifications_non_lues=nombre_notifications_non_lues
                )
            else:
                flash("Employé introuvable.", "danger")
                return redirect(url_for('coffre_fort'))

        # Charger la liste des employés
        cur.execute("SELECT id, nom, prenom FROM utilisateurs WHERE id != 0")
        employes = cur.fetchall()

        notifications = récupérer_notifications(admin_email)
        nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(admin_email)
        marquer_notifications_comme_lues(admin_email)

        return render_template(
            'admin_coffre_fort.html',
            employes=employes,
            notifications=notifications,
            nombre_notifications_non_lues=nombre_notifications_non_lues
        )

    # Si l'utilisateur est un employé
    else:
        email = session['email']
        cur.execute("SELECT id, nom, prenom FROM utilisateurs WHERE email = ?", (email,))
        employe = cur.fetchone()

        if not employe:
            flash("Utilisateur introuvable.", "danger")
            return redirect(url_for('login'))

        employe_id, nom, prenom = employe
        chemin_bulletins = os.path.join(BASE_COFFRE_FORT, "bulletins", f"{nom}{prenom}")
        chemin_contrats = os.path.join(BASE_COFFRE_FORT, "contrats", f"{nom}{prenom}")
        chemin_autres = os.path.join(BASE_COFFRE_FORT, "autres", f"{nom}{prenom}")

        bulletins = os.listdir(chemin_bulletins) if os.path.exists(chemin_bulletins) else []
        contrats = os.listdir(chemin_contrats) if os.path.exists(chemin_contrats) else []
        autres = os.listdir(chemin_autres) if os.path.exists(chemin_autres) else []

        notifications = récupérer_notifications(email)
        nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(email)
        marquer_notifications_comme_lues(email)

        return render_template(
            'coffre_fort.html',
            bulletins=bulletins,
            contrats=contrats,
            autres=autres,
            nom=nom,
            prenom=prenom,
            employe_id=employe_id,
            role=session.get('role'),
            notifications=notifications,
            nombre_notifications_non_lues=nombre_notifications_non_lues
        )

@app.route('/deposer_document/<string:id_employe>', methods=['GET', 'POST'])
def deposer_document(id_employe):
    """
    Permet à l'administrateur de déposer un document (bulletin, contrat, autre) pour un employé.
    """
    if 'role' not in session or session['role'] != 'admin':
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("SELECT nom, prenom FROM utilisateurs WHERE id = ?", (id_employe,))
    employe = cur.fetchone()

    if not employe:
        flash("Employé introuvable.", "danger")
        return redirect(url_for('afficher_employés'))

    nom, prenom = employe
    dossier_bulletins = os.path.join(BASE_COFFRE_FORT, "bulletins", f"{nom}{prenom}")
    dossier_contrats = os.path.join(BASE_COFFRE_FORT, "contrats", f"{nom}{prenom}")
    dossier_autres = os.path.join(BASE_COFFRE_FORT, "autres", f"{nom}{prenom}")

    os.makedirs(dossier_bulletins, exist_ok=True)
    os.makedirs(dossier_contrats, exist_ok=True)
    os.makedirs(dossier_autres, exist_ok=True)

    if request.method == 'POST':
        type_document = request.form['type_document']
        fichier = request.files['fichier']

        if not fichier or not allowed_file_document(fichier.filename):
            flash("Format de fichier non autorisé. Seul les pdfs sont autorisés.", "danger")
            return redirect(request.url)

        def generer_nom_fichier(type_document, nom, prenom, mois=None, annee=None, nom_document=None):
            random_digits = ''.join(random.choices(string.digits, k=8))
            if type_document == "bulletin":
                return f"{nom}.{prenom}_Bulletin_{mois}_{annee}_{random_digits}.pdf"
            elif type_document == "contrat":
                return f"{nom}.{prenom}_Contrat_{mois}_{annee}_{random_digits}.pdf"
            else:
                return f"{nom}.{prenom}_{nom_document}_{random_digits}.pdf"

        if type_document == "autre":
            nom_document = request.form['nom_document']
            if not nom_document:
                flash("Le nom du document est requis pour les documents autres.", "danger")
                return redirect(request.url)
            nom_fichier = generer_nom_fichier(type_document, nom, prenom, nom_document=nom_document)
            chemin_fichier = os.path.join(dossier_autres, nom_fichier)
        else:
            mois = request.form['mois']
            annee = request.form['annee']
            if not mois or not annee:
                flash("Le mois et l'année sont requis pour les bulletins et contrats.", "danger")
                return redirect(request.url)
            nom_fichier = generer_nom_fichier(type_document, nom, prenom, mois, annee)
            chemin_fichier = os.path.join(dossier_bulletins if type_document == "bulletin" else dossier_contrats, nom_fichier)

        fichier.save(chemin_fichier)
        flash("Document enregistrer avec succces.", "success")

        cur.execute("SELECT email FROM utilisateurs WHERE id = ?", (id_employe,))
        destinataire = cur.fetchone()[0]
        sujet = "Dépot de document"
        contenu = f"Bonjour,\n\nUn nouveau document a été déposer dans votre coffre fort.\n\nCordialement,\nEquipe RH."
        envoyer_email(sujet, destinataire, contenu)
        creer_notification(destinataire, contenu, "document")

    notifications = récupérer_notifications(admin_email)
    nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(admin_email)
    marquer_notifications_comme_lues(admin_email)

    return render_template(
        'admin_dépot.html',
        employe=employe,
        notifications=notifications,
        nombre_notifications_non_lues=nombre_notifications_non_lues
    )

@app.route('/assigner_manager', methods=['GET', 'POST'])
def assigner_manager():
    """
    Permet à l'administrateur d'assigner un manager à un employé ou un autre manager.
    """
    if 'role' not in session or session['role'] != 'admin':
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))
    connexion = connect_db()
    curseur = connexion.cursor()

    # Récupérer managers et employés
    curseur.execute("SELECT id, nom, email FROM utilisateurs WHERE role = 'manager'")
    managers = curseur.fetchall()

    curseur.execute("SELECT id, nom, email FROM utilisateurs WHERE role = 'employe'")
    employes = curseur.fetchall()

    # Récupérer l'ID du directeur
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
        SELECT m.id AS manager_id, m.nom AS manager_nom, 
               e.id AS supervise_id, e.nom AS supervise_nom
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
        nombre_notifications_non_lues=nombre_notifications_non_lues
    )

@app.route('/designer_directeur', methods=['POST'])
def designer_directeur():
    """
    Permet de désigner un nouveau directeur parmi les managers.
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

    # Réinitialiser tous les directeurs
    curseur.execute("UPDATE utilisateurs SET is_director = 0")
    # Définir le nouveau directeur
    curseur.execute("UPDATE utilisateurs SET is_director = 1 WHERE id = ?", (manager_id,))
    connexion.commit()
    connexion.close()

    flash("Le directeur a été mis à jour.", "success")
    return redirect(url_for('assigner_manager'))

@app.route('/supprimer_assignation/<string:manager_id>/<string:supervise_id>', methods=['POST'])
def supprimer_assignation(manager_id, supervise_id):
    """
    Supprime une relation d'assignation (manager->supervisé) de la table managers.
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
    API permettant de récupérer la structure managériale (organigramme) 
    à partir du directeur et de ses managers subordonnés.
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

##############################################################
#                    ROUTES POUR LE MANAGER                  #
##############################################################

@app.route('/manager_dashboard')
def manager_dashboard():
    """
    Tableau de bord du manager, affichant les employés qu'il supervise.
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
        nombre_notifications_non_lues=nombre_notifications_non_lues
    )

@app.route("/mettre_a_jour_teletravail/<string:employe_id>", methods=['POST'])
def mettre_a_jour_teletravail(employe_id):
    """
    Met à jour le nombre maximum de jours de télétravail d'un employé (uniquement pour le manager).
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
    Permet au manager de soumettre une demande de prime pour un employé qu'il supervise.
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

        # Récupérer infos de l'employé
        cur.execute("""
            SELECT nom, prenom, email
            FROM utilisateurs
            WHERE id = ?
        """, (id_employe,))
        employe = cur.fetchone()

        # Récupérer infos du manager
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
            envoyer_email(sujet, "employe_email", contenu)

            contenu_admin = f"Bonjour,\n\nUne demande de prime a été soumise pour l'employé {nom_employe} {prenom_employe}.\nMontant demandé : {montant}€\nMotif : {motif}\n\nCordialement,\nL'équipe RH."
            creer_notification(admin_email, contenu_admin, "Prime")

        flash("Demande de prime soumise avec succès.", "success")
        return redirect(url_for('manager_primes'))

    # Liste des employés supervisés
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
        nombre_notifications_non_lues=nombre_notifications_non_lues
    )

@app.route('/manager_primes', methods=['GET'])
def manager_primes():
    """
    Affiche les demandes de prime soumises par le manager connecté.
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
        nombre_notifications_non_lues=nombre_notifications_non_lues
    )

##############################################################
#                   ROUTES POUR L'EMPLOYÉ                    #
##############################################################

@app.route("/voir_mes_infos")
def voir_mes_infos():
    """
    Affiche les informations personnelles de l'employé connecté.
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
        notifications=notifications,
        nombre_notifications_non_lues=nombre_notifications_non_lues
    )

@app.route('/api/recuperer_evenements')
def recuperer_evenements():
    """
    Retourne les évènements (congés, arrêts, réunions, télétravail) 
    de l'employé connecté au format JSON (pour FullCalendar).
    """
    if 'email' not in session or session['role'] == "admin":

        flash("Vous devez être connecté pour accéder à cette page.")
        return jsonify([])

    connexion = connect_db()
    cur = connexion.cursor()

    email = session['email']
    cur.execute("""
        SELECT id FROM utilisateurs WHERE email = ? 
    """, (email,))
    id_employe = cur.fetchone()[0]

    # Congés
    cur.execute("""
        SELECT date_debut, date_fin, description 
        FROM demandes_congé 
        WHERE id_utilisateurs = ? AND statut = 'accepte'
    """, (id_employe,))
    conges = cur.fetchall()

    # Arrêts maladie
    cur.execute("""
        SELECT date_debut, date_fin, description 
        FROM demandes_arrêt 
        WHERE employe_email = ? AND statut = 'accepte'
    """, (email,))
    arrets = cur.fetchall()

    # Réunions acceptées
    cur.execute("""
        SELECT m.date_time, m.title 
        FROM réunion m
        JOIN réponse_réunion ma ON m.id = ma.meeting_id
        WHERE (ma.employee_id = (SELECT id FROM utilisateurs WHERE email = ?) OR m.created_by = ?) 
        AND ma.status = 'Accepted'
    """, (email, id_employe))
    reunions = cur.fetchall()

    # Télétravail
    cur.execute("""
        SELECT date_teletravail 
        FROM teletravail 
        WHERE id_employe = (SELECT id FROM utilisateurs WHERE email = ?)
    """, (email,))
    teletravail = cur.fetchall()

    evenements = []

    # Ajouter Congés
    for conge in conges:
        evenements.append({
            'title': 'Congé',
            'start': conge[0],
            'end': conge[1],
            'description': conge[2],
            'color': '#1e6c4d'
        })

    # Ajouter Arrêts maladie
    for arret in arrets:
        evenements.append({
            'title': 'Arrêt Maladie',
            'start': arret[0],
            'end': arret[1],
            'description': arret[2],
            'color': '#ac6430'
        })

    # Ajouter Réunions
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

    # Ajouter Télétravail
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
    Permet à un employé (ou directeur) de soumettre une demande de congé.
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

    id = session['id']
    cur.execute("SELECT solde_congé, is_director FROM utilisateurs WHERE id = ?", (id,))
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
            return render_template("employé_soumettre_congés.html", notifications=notifications, nombre_notifications_non_lues=nombre_notifications_non_lues)

        today = datetime.today().date()
        date_debut = datetime.strptime(date_debut, "%Y-%m-%d").date()

        erreur = verifier_toutes_contraintes(id, date_debut, datetime.strptime(date_fin, "%Y-%m-%d").date(), "congé")
        if erreur:
            flash(erreur, "danger")
            return render_template("employé_soumettre_congés.html", notifications=notifications, nombre_notifications_non_lues=nombre_notifications_non_lues)

        if date_debut < today:
            flash("La date de début ne peut pas être avant la date actuelle.", "error")
            connexion.close()
            return render_template("employé_soumettre_congés.html", notifications=notifications, nombre_notifications_non_lues=nombre_notifications_non_lues)

        date_fin_dt = datetime.strptime(date_fin, "%Y-%m-%d").date()
        nombre_jours = (date_fin_dt - date_debut).days + 1

        if solde_conge < nombre_jours:
            flash(f"Vous n`avez pas assez de jours de congé disponibles. Solde actuel: {solde_conge} jours.", "error")
            connexion.close()
            return render_template("employé_soumettre_congés.html")

        description = request.form['description']
        file = request.files.get('piece_jointe')
        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            file_name_only = os.path.basename(filename)
            file_path = os.path.join(creation_upload_dossier("congés"), file_name_only)
            file.save(file_path)
        else:
            file_name_only = None

        statut_manager = "accepte" if is_director else "en attente"
        statut_admin = "en attente"

        cur.execute("""
            INSERT INTO demandes_congé (
                id_utilisateurs, raison, date_debut, date_fin, description, pièce_jointe, statut_manager, statut_admin
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (id, raison, date_debut, date_fin, description, file_name_only, statut_manager, statut_admin))
        connexion.commit()

        contenu = f"Bonjour,\n\nVotre demande de congé du {date_debut} au {date_fin} a été soumise avec succès.\n\nCordialement,\nL'équipe RH"
        envoyer_email("Confirmation de dépôt de demande de congé", employe_email, contenu)
        contenu_admin = f"Une demande de congé a été soumise par {employe_email}."
        creer_notification(admin_email, contenu_admin, "Congé")

        if is_director:
            flash("Votre demande de congé a été transmise à l'administrateur.", "success")
        else:
            flash("Votre demande de congé a été soumise avec succès. En attente de validation du manager.", "success")

        cur.execute("""
            DELETE FROM teletravail
            WHERE id_employe = ? AND date_teletravail BETWEEN ? AND ?
        """, (id, date_debut, date_fin_dt))
        connexion.commit()
        connexion.close()
        return redirect(url_for('mes_demandes_conges'))

    connexion.close()
    return render_template("employé_soumettre_congés.html", notifications=notifications, nombre_notifications_non_lues=nombre_notifications_non_lues)

@app.route("/mes_demandes_conges")
def mes_demandes_conges():
    """
    Affiche les demandes de congé de l'employé connecté.
    """
    if 'email' not in session or session['role'] == "admin":
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))

    id = session['id']
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("SELECT email FROM utilisateurs WHERE id = ?", (id,))
    employe_email = cur.fetchone()[0]

    cur.execute("""
        SELECT * FROM demandes_congé
        WHERE id_utilisateurs = ?
    """, (id,))
    demandes = cur.fetchall()
    connexion.close()

    notifications = récupérer_notifications(employe_email)
    nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(employe_email)
    marquer_notifications_comme_lues(employe_email)

    return render_template(
        "employé_congés.html",
        demandes=demandes,
        notifications=notifications,
        nombre_notifications_non_lues=nombre_notifications_non_lues
    )

@app.route('/soumettre_demande_arrêt', methods=['GET', 'POST'])
def soumettre_demande_arrêt():
    """
    Permet à l'employé de soumettre une demande d'arrêt maladie.
    """
    if 'email' not in session or session['role'] == "admin":
        flash("Vous devez être connecté pour accéder à cette page.","success")
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
            return render_template('employé_soumettre_arrêts.html', notifications=notifications, nombre_notifications_non_lues=nombre_notifications_non_lues)

        if date_debut < today:
            flash("La date de début ne peut pas être avant la date actuelle.", "danger")
            return render_template('employé_soumettre_arrêts.html', notifications=notifications, nombre_notifications_non_lues=nombre_notifications_non_lues)

        erreur = verifier_toutes_contraintes(employe_email, date_debut, date_fin, "arrêt")
        if erreur:
            flash(erreur, "danger")
            return redirect(url_for('soumettre_demande_arrêt'))

        file = request.files['piece_jointe']
        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            file_path = os.path.join(creation_upload_dossier("arréts"), filename)
            file.save(file_path)
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

    return render_template('employé_soumettre_arrêts.html', notifications=notifications, nombre_notifications_non_lues=nombre_notifications_non_lues)

@app.route('/mes_demandes_d_arrêts')
def mes_demandes_d_arrêts():
    """
    Affiche les demandes d'arrêt maladie de l'employé connecté.
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
        nombre_notifications_non_lues=nombre_notifications_non_lues
    )

@app.route("/modifier_mes_infos", methods=["GET", "POST"])
def modifier_mes_infos():
    """
    Permet à l'employé de modifier ses informations personnelles (nom, prénom, email, etc.).
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

    # Récupérer l'ancienne photo avant la mise à jour
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

            nouveau_mot_de_passe_hache = bcrypt.hashpw(nouveau_mot_de_passe.encode('utf-8'), bcrypt.gensalt())
            cur.execute("UPDATE utilisateurs SET mot_de_passe = ? WHERE email = ?", (nouveau_mot_de_passe_hache, email))

        file = request.files.get('photo')
        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            photo_path = os.path.join('static/uploads/photo_profile', filename)

            # Supprimer l'ancienne photo si elle existe et n'est pas la photo par défaut
            if old_photo and old_photo != "default.png":
                old_photo_path = os.path.join('static/uploads/photo_profile', old_photo)
                if os.path.exists(old_photo_path):
                    os.remove(old_photo_path)

            file.save(photo_path)
            cur.execute("""
                UPDATE utilisateurs
                SET nom = ?, prenom = ?, date_naissance = ?, adresse = ?, ville = ?, code_postal = ?, 
                    pays = ?, nationalite = ?, telephone = ?, photo = ?, email = ?
                WHERE email = ?
            """, (nom, prenom, date_naissance, adresse, ville, code_postal, pays, nationalite, telephone, filename, nouveau_email, email))
            session['email'] = nouveau_email
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

    cur.execute("SELECT nom, prenom, date_naissance, email, adresse, ville, code_postal, pays, nationalite, telephone, photo FROM utilisateurs WHERE email = ?", (email,))
    result = cur.fetchone()
    connexion.close()

    return render_template(
        "employé_modification.html",
        result=result,
        notifications=notifications,
        nombre_notifications_non_lues=nombre_notifications_non_lues
    )


##############################################################
#             ROUTES POUR LE TÉLÉTRAVAIL (EMPLOYÉ)           #
##############################################################

@app.route('/choisir_teletravail', methods=['GET', 'POST'])
def choisir_teletravail():
    """
    Permet à l'employé de choisir ses jours de télétravail pour la semaine prochaine.
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
        nombre_notifications_non_lues=nombre_notifications_non_lues
    )

@app.route('/calendrier_teletravail')
def calendrier_teletravail():
    """
    Affiche un calendrier regroupant les jours de télétravail acceptés pour l'admin ou le manager.
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

        date = datetime.strptime(date_teletravail, '%Y-%m-%d')
        if date not in teletravail_par_jour:
            teletravail_par_jour[date] = []
        teletravail_par_jour[date].append(employe)

    return render_template(
        "calendrier_télétravail.html",
        teletravail_par_jour=teletravail_par_jour,
        role=session['role'],
        notifications=notifications,
        nombre_notifications_non_lues=nombre_notifications_non_lues
    )

##############################################################
#                  ROUTES LIÉES AUX RÉUNIONS                #
##############################################################

@app.route('/réunion_scheduler', methods=['GET', 'POST'])
def réunion_scheduler():
    """
    Permet au manager de planifier une réunion et d'inviter des employés.
    """
    if 'role' not in session or session['role'] != 'manager':
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))
    connexion = connect_db()
    cur = connexion.cursor()

    if request.method == 'POST':
        title = request.form['title']
        date_time = request.form['date_time']
        invited_employees = request.form.getlist('employees')

        cur.execute("""
            INSERT INTO réunion (title, date_time, status, created_by)
            VALUES (?, ?, 'Scheduled', ?)
        """, (title, date_time, session['id']))
        meeting_id = cur.lastrowid

        for employee_id in invited_employees:
            cur.execute("""
                INSERT INTO réponse_réunion (meeting_id, employee_id, status)
                VALUES (?, ?, 'en attente')
            """, (meeting_id, employee_id))

            # Notifier l'employé
            cur.execute("""SELECT email FROM utilisateurs WHERE id =?""", (employee_id,))
            employee_email = cur.fetchone()[0]
            connexion.commit()

            sujet = "Invitation à une réunion"
            contenu = f"Bonjour,\n\nVotre manager vous à invité à une réunion.\nVeuillez accepter ou refuser la demande.\n\nCordialement,\nL'équipe RH"
            envoyer_email(sujet, employee_email, contenu)
            creer_notification(employee_email, contenu, "Invitation")

        flash("L`invitation pour la réunion a été envoyée !", "success")
        return redirect(url_for('réunion_scheduler'))

    cur.execute("SELECT id, nom, prenom FROM utilisateurs WHERE role = 'employe'")
    employees = cur.fetchall()

    cur.execute("""
        SELECT m.id, m.title, m.date_time, COUNT(a.id) AS invited_count, 
               SUM(CASE WHEN a.status = 'Accepted' THEN 1 ELSE 0 END) AS accepted_count,
               SUM(CASE WHEN a.status = 'Rejected' THEN 1 ELSE 0 END) AS rejected_count
        FROM réunion m
        JOIN réponse_réunion a ON m.id = a.meeting_id
        GROUP BY m.id
        ORDER BY m.date_time DESC
    """)
    meetings = cur.fetchall()

    manager_id = session['id']
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
        nombre_notifications_non_lues=nombre_notifications_non_lues
    )

@app.route('/meeting_invitations', methods=['GET', 'POST'])
def meeting_invitations():
    """
    Permet à l'employé de consulter et de répondre (accepter/refuser) 
    aux invitations de réunion.
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

        # Notifier le manager
        cur.execute("""
            SELECT u.email 
            FROM managers m
            JOIN utilisateurs u ON m.id_manager = u.id
            WHERE m.id_supervise = ?
        """, (employee_id,))
        manager_email = cur.fetchone()[0]
        sujet = "Réponse à l'invitation à la réunion"
        contenu = f"Bonjour,\n\nL'un de vos employés à répondu à votre invitation.\n\nCordialement,\nL'équipe RH"
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
        nombre_notifications_non_lues=nombre_notifications_non_lues
    )

##############################################################
#              GESTION DU SCHEDULER (TÉLÉTRAVAIL)            #
##############################################################

def envoyer_notifications_teletravail():
    """
    Envoie chaque lundi à 8h un email aux employés pour leur rappeler de choisir 
    leurs jours de télétravail pour la semaine suivante.
    """
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("SELECT id, email FROM utilisateurs WHERE role = 'employe'")
    employes = cur.fetchall()

    for employe in employes:
        email = employe['email']
        contenu = "Bonjour,\n\nVeuillez choisir vos jours de télétravail pour la semaine prochaine.\n\nCordialement,\nL'équipe RH."
        sujet = "Choix des jours de télétravail"
        envoyer_email(sujet, email, contenu)
        creer_notification(email, "Veuillez choisir vos jours de télétravail pour la semaine prochaine.", "Télétravail")

    connexion.close()

scheduler = BackgroundScheduler()
scheduler.add_job(func=envoyer_notifications_teletravail, trigger="cron", day_of_week="mon", hour=8)
scheduler.start()

##############################################################
#          SUPPRESSION GLOBALE D'ÉLÉMENTS (via AJAX)         #
##############################################################

@app.route('/supprimer_elements/<string:table>', methods=['POST'])
def supprimer_elements(table):
    """
    Supprime plusieurs éléments d'une table donnée (arrêts, congés, primes, contacts, réunions).
    Vérifie également les permissions de l'utilisateur connecté.
    """
    if 'role' not in session:
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))
    data = request.get_json()
    ids = data.get('ids', [])
    if not ids:
        return jsonify({'success': False, 'message': "Aucun élément sélectionné."})

    tables_autorisees = {
        'demandes_arrêt': 'arrêts',
        'demandes_congé': 'congés',
        'demandes_prime': 'primes',
        'demandes_contact': 'contacts',
        'réunion': 'réunions'
    }
    if table not in tables_autorisees:
        return jsonify({'success': False, 'message': "Table non autorisée."})

    connexion = connect_db()
    curseur = connexion.cursor()

    # Vérification des permissions pour les managers
    email_utilisateur = session['email']
    if session['role'] == 'manager' and table != 'réunion' and table != 'demandes_prime':
        for id_element in ids:
            curseur.execute(f"""
                SELECT 1 FROM managers 
                WHERE id_manager = (SELECT id FROM utilisateurs WHERE email = ?) 
                AND id_supervise = (SELECT id_utilisateurs FROM {table} WHERE id = ?)
            """, (email_utilisateur, id_element))
            if not curseur.fetchone():
                connexion.close()
                return jsonify({'success': False, 'message': "Permission refusée pour supprimer certains éléments."})

    placeholders = ', '.join(['?'] * len(ids))
    curseur.execute(f"DELETE FROM {table} WHERE id IN ({placeholders})", ids)
    connexion.commit()
    connexion.close()

    return jsonify({'success': True, 'message': f"Les {tables_autorisees[table]} sélectionnés ont été supprimés avec succès."})

##############################################################
#                         RUN APPLICATION                    #
##############################################################

# Initialise la base de données avant le démarrage
initialiser_base_de_donnees()

if __name__ == "__main__":
    app.run(debug=True)
