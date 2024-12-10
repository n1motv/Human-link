import sqlite3
from flask import Flask, render_template, session, redirect, url_for, request ,flash,jsonify
from main import connexion_utilisateur, afficher_admin_menu, afficher_menu_employe, get_all_demandes_conges, get_demandes_conges_manager
from db_setup import cree_table_utilisateurs, cree_compte_admin, cree_table_conges,connect_db,cree_table_manager
from fonctionality import ajouter_conge_mensuel
from admin_menu import voir_employes,ajouter_employe,voir_demandes_conges,repondre_demande_conge
from getpass import getpass
import bcrypt
from datetime import datetime
from datetime import datetime, timedelta
# Initialisation de l'application Flask
app = Flask(__name__)
app.secret_key = 'cc'  # Nécessaire pour les sessions

# Vérification et création des tables nécessaires
def initialiser_base_de_donnees():
    cree_table_utilisateurs()  # Crée la table des utilisateurs si elle n'existe pas
    cree_compte_admin()        # Crée le compte admin si non existant
    cree_table_conges()
    cree_table_manager()
    ajouter_conge_mensuel()        # Crée la table des congés si elle n'existe pas

# Appel de la fonction d'initialisation
initialiser_base_de_donnees()

@app.template_filter('format_date')
def format_date(value, format="%d-%m-%Y"):
    if isinstance(value, datetime):
        return value.strftime(format)
    return value
@app.route("/admin")

def admin_dashboard():
    if 'role' not in session or (session['role'] != 'admin' and session['role']!= 'manager'):
        return redirect(url_for('login'))
    employees = voir_employes()
    
    return render_template("admin_menu.html", employees=employees)
@app.route("/ajouter_employe", methods=["GET", "POST"])
def ajouter_employe_page():
    if 'role' not in session or (session['role'] != 'admin' and session['role']!= 'manager'):
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
        role = request.form['role']
        ajouter_employe(nom, prenom, age, poste, departement, email, mot_de_passe, conge, salaire,role)
        return redirect(url_for('admin_dashboard'))
    return render_template("ajouter_employe.html")

@app.route("/demandes_conges")
def demandes_conges():
    """
    Afficher toutes les demandes de congé pour l'administrateur.
    """
    if 'role' not in session or session['role'] != 'admin':
        return redirect(url_for('login'))
    
    demandes = get_all_demandes_conges()
    return render_template("demandes_conges.html", demandes=demandes)
@app.route("/demandes_conges_manager")
def demandes_conges_manager():
    """
    Afficher les demandes de congé des employés supervisés par le manager.
    """
    if 'role' not in session or session['role'] != 'manager':
        return redirect(url_for('login'))
    
    # Obtenir les demandes de congé des employés supervisés par ce manager
    manager_email = session['email']  # L'email du manager est stocké dans la session
    demandes = get_demandes_conges_manager(manager_email)
    
    return render_template("demandes_conges_manager.html", demandes=demandes)


@app.route("/repondre_demande/<int:id>", methods=["POST"])
def repondre_demande(id):
    statut = request.form['statut']
    motif_refus = request.form['motif_refus'] if statut == 'refuser' else None
    result = repondre_demande_conge(id, statut, motif_refus)
    if result:
        return redirect(url_for('demandes_conges'))
    return "Erreur lors du traitement de la demande."

@app.route("/", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        email = request.form['email']
        mot_de_passe = request.form['mot_de_passe']

        # Vérifier dans la base de données si l'email existe
        connexion = connect_db()
        curseur = connexion.cursor()

        # Sélectionner l'utilisateur par email
        curseur.execute("""
            SELECT id, email, mot_de_passe, role FROM users WHERE email = ?
        """, (email,))
        
        utilisateur = curseur.fetchone()
        connexion.close()

        # Vérification du mot de passe avec bcrypt
        if utilisateur and bcrypt.checkpw(mot_de_passe.encode('utf-8'), utilisateur[2]):
            session['email'] = email  # Enregistrer l'email de l'utilisateur dans la session
            session['role'] = 'admin' if email == 'admin' else 'employe'  # Enregistrer le rôle de l'utilisateur
            if utilisateur[3] == 'manager' :session['role'] = 'manager' 
            # Rediriger vers le tableau de bord approprié
            session['user_id'] = utilisateur[0]
            print(session['user_id'])
            if session['role'] == 'admin':
                return redirect(url_for('admin_dashboard'))  # Rediriger vers le tableau de bord admin
            elif session['role'] == 'manager':
                return redirect(url_for('manager_dashboard'))
            else:
                return redirect(url_for('voir_mes_info'))   # Rediriger vers le tableau de bord employé
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
    """
    Supprimer une demande de congé. L'administrateur ou le manager peut supprimer les demandes.
    """
    if 'role' not in session or (session['role'] != 'admin' and session['role'] != 'manager'):
        return redirect(url_for('login'))
    
    # Connexion à la base de données
    connexion = connect_db()
    curseur = connexion.cursor()

    # Récupérer l'email de l'utilisateur connecté
    email_utilisateur = session['email']

    # Si c'est un manager, vérifier qu'il peut supprimer la demande de congé de l'employé supervisé
    if session['role'] == 'manager':
        # Vérifier si l'utilisateur est un manager pour cet employé
        curseur.execute("""
            SELECT 1 FROM managers 
            WHERE id_manager = (SELECT id FROM users WHERE email = ?) 
            AND id_employe = (SELECT id FROM conges WHERE id = ?)
        """, (email_utilisateur, id))
        if not curseur.fetchone():
            # Le manager n'a pas le droit de supprimer cette demande
            connexion.close()
            return "Vous n'avez pas l'autorisation de supprimer cette demande de congé.", 403
    
    # Supprimer la demande de congé
    curseur.execute("DELETE FROM conges WHERE id = ?", (id,))
    connexion.commit()
    connexion.close()

    return redirect(url_for('demandes_conges') if session['role'] == 'admin' else url_for('demandes_conges_manager'))

@app.route("/supprimer_demande_conge_manager/<int:id>", methods=["POST"])
def supprimer_demande_conge_manager(id):
    """
    Supprimer une demande de congé spécifique à un manager. Seul un manager peut supprimer
    les demandes de congé des employés qu'il supervise.
    """
    if 'role' not in session or session['role'] != 'manager':
        return redirect(url_for('login'))

    # Connexion à la base de données
    connexion = connect_db()
    curseur = connexion.cursor()
    curseur.execute("DELETE FROM conges WHERE id = ?", (id,))
    connexion.commit()
    connexion.close()

    return redirect(url_for('demandes_conges_manager'))

@app.route("/mettre_a_jour_employe/<int:id>", methods=["POST"])
def mettre_a_jour_employe(id):
    if 'role' not in session or (session['role'] != 'admin' and session['role']!= 'manager'):
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

@app.route('/affecter_manager', methods=['GET', 'POST'])
def assigner_manager():
    if 'role' not in session or session['role'] != 'admin':
        return redirect(url_for('login'))

    connexion = connect_db()
    curseur = connexion.cursor()

    # Fetch all available managers and employees
    curseur.execute("SELECT id, nom, email FROM users WHERE role = 'manager'")
    managers = curseur.fetchall()

    curseur.execute("SELECT id, nom, email FROM users WHERE role = 'employe'")
    employes = curseur.fetchall()

    if request.method == 'POST':
        id_manager = request.form.get('manager')
        id_employe = request.form.get('employe')

        try:
            # Insert the assignment into the database
            curseur.execute("""
                INSERT INTO managers (id_manager, id_employe)
                VALUES (?, ?)
            """, (id_manager, id_employe))
            connexion.commit()
            flash("L'employé a été affecté au manager avec succès.", "success")
        except sqlite3.IntegrityError:
            # Handle the error when the assignment already exists
            flash("Cet employé est déjà affecté à ce manager.", "error")

    # Fetch all existing assignments
    curseur.execute("""
        SELECT m.id AS manager_id, m.nom AS manager_nom, 
               e.id AS employe_id, e.nom AS employe_nom
        FROM managers
        JOIN users m ON managers.id_manager = m.id
        JOIN users e ON managers.id_employe = e.id
    """)
    assignations = curseur.fetchall()

    connexion.close()

    return render_template(
        'assigner_manager.html', 
        managers=managers, 
        employes=employes, 
        assignations=assignations
    )


@app.route('/supprimer_assignation/<int:manager_id>/<int:employe_id>', methods=['POST'])
def supprimer_assignation(manager_id, employe_id):
    if 'role' not in session or session['role'] != 'admin':
        return redirect(url_for('login'))

    connexion = connect_db()
    curseur = connexion.cursor()
    curseur.execute("DELETE FROM managers WHERE id_manager = ? AND id_employe = ?", (manager_id, employe_id))
    connexion.commit()
    connexion.close()

    return redirect(url_for('assigner_manager'))
@app.route('/manager_dashboard')
def manager_dashboard():
    # Vérifiez si l'utilisateur est connecté et s'il est un manager
    if 'role' not in session or session['role'] != 'manager':
        return redirect(url_for('login'))

    manager_id = session['user_id']  # Récupérez l'ID du manager depuis la session
    connexion = connect_db()
    curseur = connexion.cursor()

    # Récupérez les informations du manager
    curseur.execute("""
        SELECT nom, prenom, age, poste, departement, email, conge, salaire
        FROM users
        WHERE id = ?
    """, (manager_id,))
    manager_info = curseur.fetchone()

    if not manager_info:
        # Si aucune information n'est trouvée pour le manager, afficher une erreur
        return "Erreur: Aucune information pour ce manager."

    # Récupérez les employés supervisés par ce manager
    curseur.execute("""
        SELECT u.id, u.nom, u.prenom, u.age, u.poste, u.departement, u.email, 
               (CASE WHEN EXISTS (
                   SELECT 1 FROM conges WHERE conges.email = u.email AND conges.statut = 'en attente'
               ) THEN 1 ELSE 0 END) AS conge_demande
        FROM users u
        JOIN managers m ON m.id_employe = u.id
        WHERE m.id_manager = ?
    """, (manager_id,))
    employees = curseur.fetchall()

    connexion.close()

    # Passez les données au modèle HTML
    return render_template('manager_menu.html', manager=manager_info, employees=employees)

@app.route('/calendrier_conges')
def calendrier_conges():
    # Vérification des rôles (admin ou manager)
    if 'role' not in session or session['role'] != 'admin':
        return redirect(url_for('login'))

    user_id = session.get('user_id')
    role = session.get('role')
    connexion = connect_db()
    curseur = connexion.cursor()

    # Récupération des congés
    curseur.execute("""SELECT * FROM conges""")
    conges = curseur.fetchall()
    connexion.close()

    # Organiser les congés par date
    conges_par_jour = {}
    for conge in conges:
        date_debut = datetime.strptime(conge[3], '%Y-%m-%d')  # date_debut en 3ème colonne
        date_fin = datetime.strptime(conge[4], '%Y-%m-%d')    # date_fin en 4ème colonne

        current_day = date_debut
        while current_day <= date_fin:
            if current_day not in conges_par_jour:
                conges_par_jour[current_day] = []
            conges_par_jour[current_day].append(conge)
            current_day += timedelta(days=1)

    return render_template('calendrier_conges.html', conges_par_jour=conges_par_jour, role=role)

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for('login'))



if __name__ == "__main__":
    app.run(debug=True)