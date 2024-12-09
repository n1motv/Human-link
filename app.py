from flask import Flask, render_template, session, redirect, url_for, request
from main import connexion_utilisateur, afficher_admin_menu, afficher_menu_employe
from db_setup import cree_table_utilisateurs, cree_compte_admin, cree_table_conges,connect_db
from fonctionality import ajouter_conge_mensuel
from admin_menu import voir_employes,ajouter_employe,voir_demandes_conges,repondre_demande_conge
from tabulate import tabulate
from getpass import getpass
import bcrypt
from datetime import datetime, timedelta
# Initialisation de l'application Flask
app = Flask(__name__)
app.secret_key = 'cc'  # Nécessaire pour les sessions

# Vérification et création des tables nécessaires
def initialiser_base_de_donnees():
    cree_table_utilisateurs()  # Crée la table des utilisateurs si elle n'existe pas
    cree_compte_admin()        # Crée le compte admin si non existant
    cree_table_conges()
    ajouter_conge_mensuel()        # Crée la table des congés si elle n'existe pas

# Appel de la fonction d'initialisation
initialiser_base_de_donnees()

@app.route("/admin")
def admin_dashboard():
    if 'role' not in session or session['role'] != 'admin':
        return redirect(url_for('login'))
    employees = voir_employes()
    return render_template("admin_menu.html", employees=employees)

@app.route("/ajouter_employe", methods=["GET", "POST"])
def ajouter_employe_page():
    if 'role' not in session or session['role'] != 'admin':
        return redirect(url_for('login'))
    if request.method == "POST":
        nom = request.form['nom']
        prenom = request.form['prenom']
        age = request.form['age']
        poste = request.form['poste']
        departement = request.form['departement']
        email = request.form['email']
        mot_de_passe = request.form['mot_de_passe']
        conge = request.form['conge']
        salaire = request.form['salaire']
        ajouter_employe(nom, prenom, age, poste, departement, email, mot_de_passe, conge, salaire)
        return redirect(url_for('admin_dashboard'))
    return render_template("ajouter_employe.html")

@app.route("/demandes_conges")
def demandes_conges():
    if 'role' not in session or session['role'] != 'admin':
        return redirect(url_for('login'))
    demandes = voir_demandes_conges()
    return render_template("demandes_conges.html", demandes=demandes)

@app.route("/repondre_demande/<int:id>", methods=["POST"])
def repondre_demande(id):
    statut = request.form['statut']
    motif_refus = request.form['motif_refus'] if statut == 'refuser' else None
    result = repondre_demande_conge(id, statut, motif_refus)
    if result:
        return redirect(url_for('demandes_conges'))
    return "Erreur lors du traitement de la demande."

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        email = request.form['email']
        mot_de_passe = request.form['mot_de_passe']

        # Vérifier dans la base de données si l'email existe
        connexion = connect_db()
        curseur = connexion.cursor()

        # Sélectionner l'utilisateur par email
        curseur.execute("""
            SELECT id, email, mot_de_passe FROM users WHERE email = ?
        """, (email,))
        
        utilisateur = curseur.fetchone()
        connexion.close()

        # Vérification du mot de passe avec bcrypt
        if utilisateur and bcrypt.checkpw(mot_de_passe.encode('utf-8'), utilisateur[2]):
            session['email'] = email  # Enregistrer l'email de l'utilisateur dans la session
            session['role'] = 'admin' if email == 'admin' else 'employe'  # Enregistrer le rôle de l'utilisateur

            # Rediriger vers le tableau de bord approprié
            if session['role'] == 'admin':
                return redirect(url_for('admin_dashboard'))  # Rediriger vers le tableau de bord admin
            else:
                return redirect(url_for('voir_mes_info'))  # Rediriger vers le tableau de bord employé
        else:
            message = "Identifiants incorrects"
            return render_template("login.html", message=message)

    return render_template("login.html")

# Fonction pour afficher les informations d'un employé
@app.route("/employe_info")
def voir_mes_info():
    if 'email' not in session:
        return redirect(url_for('login'))  # Rediriger si non connecté
    
    email = session['email']
    connexion = connect_db()
    curseur = connexion.cursor()
    curseur.execute("""
        SELECT nom, prenom, age, poste, departement, email, conge, salaire FROM users WHERE email = ? 
    """, (email,))
    resultats = curseur.fetchall()
    connexion.close()
    
    return render_template("employe_info.html", resultats=resultats)

# Fonction pour soumettre une demande de congé
@app.route("/soumettre_demande_conge", methods=["GET", "POST"])
def soumettre_demande_conge():
    if 'email' not in session:
        return redirect(url_for('login'))  # Rediriger si non connecté
    
    if request.method == "POST":
        email = session['email']
        raison = request.form['raison']
        date_debut = request.form['date_debut']
        date_fin = request.form['date_fin']
        plus_infos = request.form['plus_infos']
        
        connexion = connect_db()
        cur = connexion.cursor()
        cur.execute("""
            INSERT INTO conges (email, raison, date_debut, date_fin, plus_infos)
            VALUES (?, ?, ?, ?, ?)
        """, (email, raison, date_debut, date_fin, plus_infos))
        connexion.commit()
        connexion.close()

        return redirect(url_for('voir_suivi_demandes_conges'))
    
    return render_template("soumettre_demande_conge.html")

# Fonction pour afficher les demandes de congé soumises
@app.route("/suivi_demandes_conges")
def voir_suivi_demandes_conges():
    if 'email' not in session:
        return redirect(url_for('login'))  # Rediriger si non connecté
    
    email = session['email']
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        SELECT id, raison, date_debut, date_fin, plus_infos, statut, motif_refus
        FROM conges
        WHERE email = ?
    """, (email,))
    demandes = cur.fetchall()
    connexion.close()

    return render_template("suivi_demandes_conges.html", demandes=demandes)


@app.route("/supprimer_employe/<int:id>", methods=["POST"])
def supprimer_employe(id):
    if 'role' not in session or session['role'] != 'admin':
        return redirect(url_for('login'))
    
    # Connexion à la base de données
    connexion = connect_db()
    curseur = connexion.cursor()
    
    # Supprimer l'employé de la base de données
    curseur.execute("DELETE FROM users WHERE id = ?", (id,))
    connexion.commit()
    connexion.close()

    # Redirection vers la page des employés après suppression
    return redirect(url_for('admin_dashboard'))

@app.route("/supprimer_demande_conge/<int:id>", methods=["POST"])
def supprimer_demande_conge(id):
    if 'role' not in session or session['role'] != 'admin':
        return redirect(url_for('login'))
    
    # Connexion à la base de données
    connexion = connect_db()
    curseur = connexion.cursor()
    
    # Supprimer la demande de congé de la base de données
    curseur.execute("DELETE FROM conges WHERE id = ?", (id,))
    connexion.commit()
    connexion.close()

    # Redirection vers la page des demandes de congés après suppression
    return redirect(url_for('demandes_conges'))
@app.route("/mettre_a_jour_employe/<int:id>", methods=["POST"])
def mettre_a_jour_employe(id):
    if 'role' not in session or session['role'] != 'admin':
        return redirect(url_for('login'))

    # Récupérer les informations modifiées depuis le formulaire
    nom = request.form['nom']
    prenom = request.form['prenom']
    age = request.form['age']
    poste = request.form['poste']
    email = request.form['email']
    salaire = request.form['salaire']
    mot_de_passe = request.form.get('mot_de_passe')  # Récupérer le mot de passe (si fourni)
    conge = request.form.get('conge')  # Récupérer les congés (par défaut 10 jours si non fourni)

    # Appeler la fonction pour mettre à jour l'employé avec tous les paramètres nécessaires
    if mot_de_passe:
        mot_de_passe_hash = bcrypt.hashpw(mot_de_passe.encode('utf-8'), bcrypt.gensalt())
    else:
        mot_de_passe_hash = None  # Si le mot de passe n'est pas fourni, ne pas le modifier

    # Connexion à la base de données
    connexion = connect_db()
    curseur = connexion.cursor()
    
    # Mise à jour des informations de l'employé dans la base de données
    curseur.execute("""
        UPDATE users
        SET nom = ?, prenom = ?, age = ?, poste = ?, email = ?, mot_de_passe = ?, conge = ?, salaire = ?
        WHERE id = ?
    """, (nom, prenom, age, poste, email, mot_de_passe_hash, conge, salaire, id))
    
    connexion.commit()  # Sauvegarde des changements
    connexion.close()

    # Rediriger vers le tableau de bord admin
    return redirect(url_for('admin_dashboard'))


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for('login'))



if __name__ == "__main__":
    app.run(debug=True)