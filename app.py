import sqlite3
from flask import Flask, render_template, session, redirect, url_for, request ,flash
from main import get_all_demandes_conges, get_demandes_conges_manager
from db_setup import cree_table_utilisateurs, cree_compte_admin, cree_table_conges,connect_db,cree_table_manager, cree_table_arrets_maladie
from fonctionality import ajouter_conge_mensuel
from admin_menu import voir_employes,ajouter_employe,repondre_demande_conge
import bcrypt,os
from werkzeug.utils import secure_filename
from datetime import datetime
from datetime import datetime, timedelta
# Initialisation de l'application Flask
app = Flask(__name__)
app.secret_key = 'cc'  # Nécessaire pour les sessions


def creation_upload_dossier(nom):
    BASE_UPLOAD_FOLDER = 'HR_management2-main/static/uploads/'
    full_path = os.path.join(BASE_UPLOAD_FOLDER, nom)  
    app.config['UPLOAD_FOLDER'] = full_path
    app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024
    if not os.path.exists(app.config['UPLOAD_FOLDER']):
        os.makedirs(app.config['UPLOAD_FOLDER'])
    return full_path


ALLOWED_EXTENSIONS = {'pdf', 'png', 'jpg', 'jpeg', 'gif'}
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


# Vérification et création des tables nécessaires
def initialiser_base_de_donnees():
    cree_table_utilisateurs()
    cree_table_arrets_maladie()  # Crée la table des utilisateurs si elle n'existe pas
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

def get_demande_by_id(id_demande):
    # Connexion à la base de données
    connexion = connect_db()
    curseur = connexion.cursor()

    # Exécute la requête pour obtenir les informations de la demande par son ID
    curseur.execute("SELECT * FROM conges WHERE id = ?", (id_demande,))
    demande = curseur.fetchone()

    # Ferme la connexion après l'exécution de la requête
    connexion.close()

    # Retourne les informations de la demande ou None si elle n'existe pas
    return demande

@app.route("/repondre_demande/<int:id>", methods=["POST"])
def repondre_demande(id):
    statut = request.form['statut']
    motif_refus = request.form['motif_refus'] if statut == 'refuser' else None

    # Vérifie si la demande est déjà acceptée ou refusée
    demande = get_demande_by_id(id)  # Supposons que cette fonction récupère la demande
    if demande[6] in ['accepte', 'refuse']:  # statut est déjà "accepté" ou "refusé"
        return redirect(url_for('demandes_conges'))

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
from flask import flash

from datetime import datetime

@app.route("/soumettre_demande_conge", methods=["GET", "POST"])
def soumettre_demande_conge():
    if 'email' not in session:
        return redirect(url_for('login'))  # Rediriger si non connecté
    
    # Connexion à la base de données
    connexion = connect_db()
    cur = connexion.cursor()

    # Vérification du solde de congé de l'utilisateur
    email = session['email']
    cur.execute("SELECT conge FROM users WHERE email = ?", (email,))
    solde_conge = cur.fetchone()

    if solde_conge is None:
        connexion.close()
        return "Utilisateur non trouvé", 404  # Si l'utilisateur n'existe pas dans la table users

    solde_conge = solde_conge[0]  # Récupérer le solde de congé

    if request.method == "POST":
        raison = request.form['raison']
        date_debut = request.form['date_debut']
        date_fin = request.form['date_fin']

        # Validation de la date de début côté serveur
        today = datetime.today().date()
        date_debut = datetime.strptime(date_debut, "%Y-%m-%d").date()
        
        if date_debut < today:
            flash("La date de début ne peut pas être avant la date actuelle.", "error")
            connexion.close()
            return render_template("soumettre_demande_conge.html")

        # Calcul du nombre de jours de congé demandés
        date_fin = datetime.strptime(date_fin, "%Y-%m-%d").date()
        nombre_jours = (date_fin - date_debut).days + 1

        # Vérification si l'utilisateur a assez de jours de congé
        if solde_conge < nombre_jours:
            flash(f"Vous n'avez pas assez de jours de congé disponibles. Solde actuel: {solde_conge} jours.", "error")
            connexion.close()
            return render_template("soumettre_demande_conge.html")  # Afficher le formulaire avec l'erreur

        plus_infos = request.form['plus_infos']
        file = request.files.get('piece_jointe')
        if file and allowed_file(file.filename):
            # Sécuriser le nom du fichier et le sauvegarder
            filename = secure_filename(file.filename)
            file_name_only = os.path.basename(filename)
            file_path = os.path.join(creation_upload_dossier("congés"), file_name_only)
            file.save(file_path)
        else:
            file_name_only = None  # Aucun fichier ou fichier non valide

        # Si tout est valide, on enregistre la demande
        cur.execute("""
            INSERT INTO conges (email, raison, date_debut, date_fin, plus_infos, pièce_jointe)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (email, raison, date_debut, date_fin, plus_infos, file_name_only))
        connexion.commit()
        connexion.close()

        # Mise à jour du solde de congé
        nouveau_solde = solde_conge - nombre_jours
        connexion = connect_db()
        cur = connexion.cursor()
        cur.execute("UPDATE users SET conge = ? WHERE email = ?", (nouveau_solde, email))
        connexion.commit()
        connexion.close()

        return redirect(url_for('voir_suivi_demandes_conges'))

    # Si c'est une requête GET, on affiche le formulaire
    return render_template('soumettre_demande_conge.html')

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

from datetime import datetime, timedelta

@app.route('/calendrier_conges')
def calendrier_conges():
    # Vérification du rôle
    if 'role' not in session or session['role'] != 'admin':
        return redirect(url_for('login'))

    user_id = session.get('user_id')
    role = session.get('role')
    connexion = connect_db()
    curseur = connexion.cursor()

    # Récupération des congés
    curseur.execute("""SELECT c.*, u.prenom, u.nom FROM conges c
                       JOIN users u ON c.email = u.email
                       WHERE c.statut = 'accepté'""")  # Filtrer les congés acceptés
    conges = curseur.fetchall()
    connexion.close()

    # Organiser les congés par date
    conges_par_jour = {}
    for conge in conges:
        email = conge[1]
        raison = conge[2]
        date_debut = datetime.strptime(conge[3], '%Y-%m-%d')  # date_debut
        date_fin = datetime.strptime(conge[4], '%Y-%m-%d')    # date_fin
        nom = conge[8]  # Nom de l'utilisateur
        prenom = conge[9]  # Prénom de l'utilisateur
        plus_infos = conge[5]
        statut = conge[6]

        # Vous pouvez choisir une logique pour la couleur, par exemple, baser sur la raison ou le statut
        if statut == 'accepté':
            color = '#3498db'  # Bleu pour accepté
        else:
            color = '#e67e22'  # Orange pour autres (en attente, refusé)

        current_day = date_debut
        while current_day <= date_fin:
            if current_day not in conges_par_jour:
                conges_par_jour[current_day] = []
            conges_par_jour[current_day].append({
                'nom': nom,
                'prenom': prenom,
                'raison': raison,
                'plus_infos': plus_infos,
                'statut': statut,
                'color': color
            })
            current_day += timedelta(days=1)

    return render_template('calendrier_conges.html', conges_par_jour=conges_par_jour, role=role)


@app.route('/depot_arret', methods=['GET', 'POST'])
def depot_arret():
    # Vérifiez si l'utilisateur est connecté
    if 'email' not in session:
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))

    if request.method == 'POST':
        # Récupérez l'email depuis la session
        employe_email = session['email']
        type_maladie = request.form['type_maladie']
        date_debut = request.form['date_debut']
        date_fin = request.form['date_fin']
        description = request.form['description']
        
        # Validation de la date de début côté serveur
        today = datetime.today().date()
        date_debut = datetime.strptime(date_debut, "%Y-%m-%d").date()
        
        if date_debut < today:
            flash("La date de début ne peut pas être avant la date actuelle.", "error")
            return render_template('depot_arret.html')

        # Traitement du fichier joint
        file = request.files['piece_jointe']
        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            file_path = os.path.join(creation_upload_dossier("arréts"), filename)
            file.save(file_path)
        else:
            file_path = None

        # Enregistrement dans la base de données
        connexion = connect_db()
        cur = connexion.cursor()
        cur.execute("""
            INSERT INTO arrets_maladie (employe_email, type_maladie, date_debut, date_fin, description, piece_jointe)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (employe_email, type_maladie, date_debut, date_fin, description, filename))
        connexion.commit()
        connexion.close()

        flash('Votre arrêt de maladie a été soumis avec succès.')
        return redirect(url_for('depot_arret'))

    return render_template('depot_arret.html')

@app.route('/suivi_arrets')
def suivi_arrets():
    # Vérifiez si l'utilisateur est connecté
    if 'email' not in session:
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))
    
    # Récupérez l'email de l'utilisateur connecté depuis la session
    employe_email = session['email']
    
    # Connexion à la base de données et récupération des arrêts
    
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("SELECT * FROM arrets_maladie WHERE employe_email = ?", (employe_email,))
    arrets = cur.fetchall()
    connexion.close()
    
    # Affichez les arrêts dans la page HTML
    return render_template('suivi_arrets.html', arrets=arrets)


@app.route('/admin_arrets', methods=['GET', 'POST'])
def admin_arrets():
    if request.method == 'POST':
        id = request.form['id']
        statut = request.form['statut']
        motif_refus = request.form.get('motif_refus', None)

        connexion = connect_db()
        cur = connexion.cursor()
        if statut == 'refuse':
            cur.execute("""
                UPDATE arrets_maladie
                SET statut = ?, motif_refus = ?
                WHERE id = ?
            """, (statut, motif_refus, id))
        else:
            cur.execute("""
                UPDATE arrets_maladie
                SET statut = ?, motif_refus = NULL
                WHERE id = ?
            """, (statut, id))
        connexion.commit()
        connexion.close()

    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("SELECT * FROM arrets_maladie")
    arrets = cur.fetchall()
    connexion.close()
    return render_template('admin_arrets.html', arrets=arrets)


@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for('login'))



if __name__ == "__main__":
    app.run(debug=True)