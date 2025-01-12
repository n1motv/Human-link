import sqlite3,bcrypt,os,uuid,string,random
from flask import Flask, render_template, session, redirect, url_for, request ,flash ,jsonify
from main import get_all_demandes_conges, get_demandes_conges_manager
from db_setup import cree_table_utilisateurs,cree_table_prime, cree_compte_admin, cree_table_conges,connect_db,cree_table_manager, cree_table_arrets_maladie,    cree_table_meetings , cree_table_meeting_attendance
from fonctionality import ajouter_conge_mensuel
from admin_menu import voir_employes,ajouter_employe,repondre_demande_conge
from werkzeug.utils import secure_filename
from datetime import datetime
from datetime import datetime, timedelta
from dotenv import load_dotenv
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from forms import LoginForm
from flask_mail import Mail, Message
from random import randint

# Initialisation de l'application Flask

load_dotenv()
app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY')
app.config['SESSION_PERMANENT'] = False
app.config['TEMPLATES_AUTO_RELOAD'] = True
app.config['DEBUG'] = True
app.config['MAIL_SERVER'] = 'smtp.gmail.com'
app.config['MAIL_PORT'] = 587
app.config['MAIL_USE_TLS'] = True
app.config['MAIL_USERNAME'] = os.getenv('MAIL_USERNAME')
app.config['MAIL_PASSWORD'] = os.getenv('MAIL_PASSWORD')

def creation_upload_dossier(nom):
    BASE_UPLOAD_FOLDER = 'static/uploads/'
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
    cree_table_prime()
    ajouter_conge_mensuel()        # Crée la table des congés si elle n'existe pas
    cree_table_meetings()  # Create the meetings table
    cree_table_meeting_attendance() 
# Appel de la fonction d'initialisation


@app.template_filter('format_datetime')
def format_datetime(value, format='%d-%m-%Y %H:%M'):
    if isinstance(value, datetime):
        return value.strftime(format)
    try:
        value = datetime.strptime(value, '%Y-%m-%d %H:%M:%S')
        return value.strftime(format)
    except Exception:
        return value

def generer_id():
    numeros = ''.join(random.choices(string.digits, k=5))
    lettre = random.choice(string.ascii_uppercase)
    return f"0{numeros}{lettre}"
def id_existe(id_employe):
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("SELECT 1 FROM utilisateurs WHERE id = ?", (id_employe,))
    return cur.fetchone() is not None


##############################################LOGIN#########################################

limiter = Limiter(
    get_remote_address,
    app=app
)

@app.route("/", methods=["GET", "POST"])
@limiter.limit("5 per minute")
def login():
    form = LoginForm()
    if form.validate_on_submit():
        email = form.email.data
        mot_de_passe = form.mot_de_passe.data

        # Vérifier dans la base de données si l'email existe
        connexion = connect_db()
        curseur = connexion.cursor()

        # Sélectionner l'utilisateur par email
        curseur.execute("""
            SELECT id, email, mot_de_passe, role FROM utilisateurs WHERE email = ?
        """, (email,))
        
        utilisateur = curseur.fetchone()
        connexion.close()

        # Vérification du mot de passe avec bcrypt
        if utilisateur and bcrypt.checkpw(mot_de_passe.encode('utf-8'), utilisateur[2]):
            session['email'] = email  # Enregistrer l'email de l'utilisateur dans la session
            session['role'] = 'admin' if email == 'admin@gmail.com' else 'employe'  # Enregistrer le rôle de l'utilisateur
            if utilisateur[3] == 'manager' :session['role'] = 'manager' 
            # Rediriger vers le tableau de bord approprié
            session['id'] = utilisateur[0]
            session['email'] = utilisateur[1]
            if session['role'] == 'admin':
                return render_template('loading.html', redirect_url=url_for('admin_dashboard'))  # Rediriger vers le tableau de bord admin
            elif session['role'] == 'manager':
                return render_template('loading.html', redirect_url=url_for('manager_dashboard'))
            else:

                return render_template('loading.html', redirect_url=url_for('voir_mes_infos'))
        else:
            flash("Identifiants incorrects", "danger")
    return render_template("login.html",form=form)
@app.route('/admin_dashboard')
def admin_dashboard():
    if 'role' not in session or session['role'] != 'admin':
        return redirect(url_for('login'))
    connexion = connect_db()
    cur = connexion.cursor()

    # Total des employés
    cur.execute("""SELECT COUNT(*) FROM utilisateurs WHERE email NOT IN ("admin@gmail.com", "admin")
                """)
    total_employes = cur.fetchone()[0]

    # Total des départements distincts
    cur.execute("""SELECT COUNT(DISTINCT(departement)) FROM utilisateurs WHERE email NOT IN ("admin@gmail.com", "admin")
                """)
    total_departements = cur.fetchone()[0]

    # Total des congés acceptés
    cur.execute("SELECT COUNT(*) FROM demandes_congé WHERE statut = 'accepte'")
    conges_acceptes = cur.fetchone()[0]

    # Salaire moyen
    cur.execute("""SELECT AVG(salaire) FROM utilisateurs WHERE email NOT IN ("admin@gmail.com", "admin")
                """)
    salaire_moyen = round(cur.fetchone()[0], 2)

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

        # Congés actifs par jour
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
        FROM utilisateurs WHERE email NOT IN ("admin@gmail.com", "admin")
        GROUP BY departement
    """)
    employes_par_departement_data = cur.fetchall()
    departement_labels = [row[0] for row in employes_par_departement_data]
    employes_par_departement = [row[1] for row in employes_par_departement_data]

    connexion.close()
    notifications = récupérer_notifications("admin@gmail.com")
    nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues("admin@gmail.com")
    # Marquer les notifications comme lues après les avoir affichées
    marquer_notifications_comme_lues("admin@gmail.com")
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
        nombre_notifications_non_lues=nombre_notifications_non_lues
    )

##############################################ADMIN#########################################
@app.route("/afficher_employers")
def afficher_employés():
    if 'role' not in session or session['role'] != 'admin':
        return redirect(url_for('login'))
    user_id = session['id']
    employees = voir_employes()
    return render_template("afficher_employés.html", employees=employees, role=session.get('role'))

def email_existe(email):
    """Vérifie si un email existe déjà dans la table utilisateurs."""
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("SELECT 1 FROM utilisateurs WHERE email = ?", (email,))
    existe = cur.fetchone() is not None
    connexion.close()
    return existe

@app.route("/ajouter_employe", methods=["GET", "POST"])
def ajouter_employe_page():
    if 'role' not in session or (session['role'] != 'admin' and session['role'] != 'manager'):
        return redirect(url_for('login'))
    
    erreur = None  # Variable pour stocker les messages d'erreur

    if request.method == "POST":
        email = request.form['email']
        
        if email_existe(email):
            erreur = "Cet email est déjà assigné à un autre employé."
        else:
            # Récupérer les données du formulaire
            nom = request.form['nom']
            prenom = request.form['prenom']
            date_naissance = request.form['date_naissance']
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
            mot_de_passe = request.form['mot_de_passe']
            solde_congé = request.form['solde_congé']
            salaire = request.form['salaire']
            role = request.form['role']

            # Générer un ID unique pour l'employé
            id_employe = generer_id()
            while id_existe(id_employe):  # Vérifier si l'ID existe déjà
                id_employe = generer_id()
            
            file = request.files['photo']
            if file and allowed_file(file.filename):
                filename = secure_filename(file.filename)
                extension = filename.rsplit('.', 1)[1].lower()
                
                # Générer un nom unique pour la photo
                unique_name = f"photo_{uuid.uuid4().hex}.{extension}"
                upload_folder = creation_upload_dossier("photo_profile")

                # Vérification de l'existence du fichier
                while os.path.exists(os.path.join(upload_folder, unique_name)):
                    unique_name = f"photo_{uuid.uuid4().hex}.{extension}"

                # Sauvegarder la photo
                file.save(os.path.join(upload_folder, unique_name))
                file_name_only = unique_name
            else:
                file_name_only = 'default.png'  # Photo par défaut
            # Ajouter l'employé dans la base de données
            ajouter_employe(
                id_employe, nom, prenom, date_naissance, poste, departement, email, mot_de_passe, 
                solde_congé, salaire, role, file_name_only, sexualite, telephone, adresse, 
                ville, code_postal, pays, nationalite, numero_securite_sociale, date_embauche, type_contrat
            )
            return redirect(url_for('afficher_employés'))

    return render_template("ajouter_employe.html", erreur=erreur)


@app.route("/afficher_demandes_congé")
def afficher_demandes_congé():
    """
    Afficher toutes les demandes de congé pour l'administrateur.
    """
    print(session['role'])
    if 'role' not in session:
        return redirect(url_for('login'))
    manager_email = session['email']
    if session['role'] == 'admin' :
        demandes = get_all_demandes_conges()
        return render_template("admin_congés.html", demandes=demandes)
    elif session['role'] == 'manager' :
        demandes = get_demandes_conges_manager(manager_email)    
        return render_template("voir_demandes_conges_manager.html", demandes=demandes)
    else:
        return redirect(url_for('login'))
def get_demande_by_id(id_demande):
    # Connexion à la base de données
    connexion = connect_db()
    curseur = connexion.cursor()

    # Exécute la requête pour obtenir les informations de la demande par son ID
    curseur.execute("SELECT * FROM demandes_congé WHERE id = ?", (id_demande,))
    demande = curseur.fetchone()

    # Ferme la connexion après l'exécution de la requête
    connexion.close()

    # Retourne les informations de la demande ou None si elle n'existe pas
    return demande

@app.route("/répondre_congés/<int:id>", methods=["POST"])
def répondre_congés(id):
    statut = request.form['statut']
    motif_refus = request.form['motif_refus'] if statut == 'refuse' else None

    # Vérifie si la demande est déjà acceptée ou refusée
    demande = get_demande_by_id(id)  # Supposons que cette fonction récupère la demande
    if demande[6] in ['accepte', 'refuse']:  # statut est déjà "accepté" ou "refusé"
        return redirect(url_for('afficher_demandes_congé'))

    result = repondre_demande_conge(id, statut, motif_refus)
    if result:
        # 📧 Envoi d'un email au demandeur
        id = demande[1]  # Récupère l'email depuis la demande 
        connexion = connect_db()
        curseur = connexion.cursor()
        curseur.execute("""SELECT email FROM utilisateurs WHERE id = ?""",(id,))
        employe_email= curseur.fetchone()[0]
        if statut == 'accepte':
            sujet = "Demande de congé acceptée"
            contenu = f"Bonjour,\n\nVotre demande de congé a été acceptée.\n\nCordialement,\nL'équipe RH"
        else:
            sujet = "Demande de congé refusée"
            contenu = f"Bonjour,\n\nVotre demande de congé a été refusée pour le motif suivant : {motif_refus}.\n\nCordialement,\nL'équipe RH"

        envoyer_email(sujet, employe_email, contenu)
        creer_notification(employe_email, contenu, "Congé")
        return redirect(url_for('afficher_demandes_congé'))
        
    return "Erreur lors du traitement de la demande."



# Fonction pour afficher les informations d'un employé
@app.route("/voir_mes_infos")
def voir_mes_infos():
    if 'email' not in session:
        return redirect(url_for('login'))  # Rediriger si non connecté
    
    email = session['email']
    user_id = session['id']
    notifications = récupérer_notifications(email)
    nombre_notifications_non_lues = récupérer_nombre_notifications_non_lues(email)

    # Marquer les notifications comme lues après les avoir affichées
    marquer_notifications_comme_lues(email)
    connexion = connect_db()
    curseur = connexion.cursor()
    curseur.execute("""
        SELECT nom, prenom, date_naissance, poste, departement, email, solde_congé, salaire,photo,id,role,sexualite,telephone,adresse,ville,code_postal,pays,nationalite,numero_securite_sociale,date_embauche,type_contrat FROM utilisateurs WHERE email = ? 
    """, (email,))
    
    resultats = curseur.fetchall()
    connexion.close()
    
    return render_template("voir_mes_infos.html", resultats=resultats, role=session.get('role'), notifications=notifications, nombre_notifications_non_lues=nombre_notifications_non_lues)



@app.route("/soumettre_demande_conge", methods=["GET", "POST"])
def soumettre_demande_conge():
    
    # Connexion à la base de données
    connexion = connect_db()
    cur = connexion.cursor()

    # Vérification du solde de congé de l'utilisateur
    id = session['id']
    cur.execute("SELECT solde_congé FROM utilisateurs WHERE id = ?", (id,))
    solde_conge = cur.fetchone()

    if solde_conge is None:
        connexion.close()
        return "Utilisateur non trouvé", 404  # Si l'utilisateur n'existe pas dans la table utilisateurs

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

        description = request.form['description']
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
            INSERT INTO demandes_congé (id_utilisateurs, raison, date_debut, date_fin, description, pièce_jointe)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (id, raison, date_debut, date_fin, description, file_name_only))
        connexion.commit()
        connexion.close()
        # 📧 Envoi d'un email de confirmation
        employe_email = session['email']
        sujet = "Confirmation de dépôt de demande de congé"
        contenu = f"Bonjour,\n\nVotre demande de congé du {date_debut} au {date_fin} a été soumise avec succès.\n\nCordialement,\nL'équipe RH"
        envoyer_email(sujet, employe_email, contenu)
        contenu=f"Une demande de congé de {employe_email} à été deposer"
        creer_notification("admin@gmail.com", contenu, "Congé")
        # Mise à jour du solde de congé
        nouveau_solde = solde_conge - nombre_jours
        connexion = connect_db()
        cur = connexion.cursor()
        cur.execute("UPDATE utilisateurs SET solde_congé = ? WHERE id = ?", (nouveau_solde, id))
        connexion.commit()
        connexion.close()

        return redirect(url_for('mes_demandes_conges'))

    # Si c'est une requête GET, on affiche le formulaire
    return render_template('soumettre_demande_conge.html')

# Fonction pour afficher les demandes de congé soumises
@app.route("/mes_demandes_conges")
def mes_demandes_conges():
    if 'email' not in session:
        return redirect(url_for('login'))  # Rediriger si non connecté
    
    id = session['id']
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        SELECT id, raison, date_debut, date_fin, description, statut, motif_refus
        FROM demandes_congé
        WHERE id_utilisateurs = ?
    """, (id,))
    demandes = cur.fetchall()
    connexion.close()

    return render_template("mes_demandes_conges.html", demandes=demandes)


@app.route("/supprimer_employe/<string:id>", methods=["POST"])
def supprimer_employe(id):
    if 'role' not in session or session['role'] != 'admin':
        return redirect(url_for('login'))
    
    # Connexion à la base de données
    connexion = connect_db()
    curseur = connexion.cursor()
    
    # Supprimer l'employé de la base de données
    curseur.execute("DELETE FROM utilisateurs WHERE id = ?", (id,))
    connexion.commit()
    connexion.close()

    # Redirection vers la page des employés après suppression
    return redirect(url_for('afficher_employés'))

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
            WHERE id_manager = (SELECT id FROM utilisateurs WHERE email = ?) 
            AND id_employe = (SELECT id FROM demandes_congé WHERE id = ?)
        """, (email_utilisateur, id))
        if not curseur.fetchone():
            # Le manager n'a pas le droit de supprimer cette demande
            connexion.close()
            return "Vous n'avez pas l'autorisation de supprimer cette demande de congé.", 403
    
    # Supprimer la demande de congé
    curseur.execute("DELETE FROM demandes_congé WHERE id = ?", (id,))
    connexion.commit()
    connexion.close()

    return redirect(url_for('afficher_demandes_congé') if session['role'] == 'admin' else url_for('demandes_conges_manager'))

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
    curseur.execute("DELETE FROM demandes_congé WHERE id = ?", (id,))
    connexion.commit()
    connexion.close()

    return redirect(url_for('demandes_conges_manager'))

@app.route("/mettre_a_jour_employe/<string:id>", methods=["POST"])
def mettre_a_jour_employe(id):
    if 'role' not in session or session['role'] != 'admin':
        return redirect(url_for('login'))

    # Récupérer les informations modifiées depuis le formulaire
    champs_a_mettre_a_jour = [
        ("nom", request.form['nom']),
        ("prenom", request.form['prenom']),
        ("date_naissance", request.form['date_naissance']),
        ("poste", request.form['poste']),
        ("email", request.form['email']),
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

    file = request.files.get('photo')  # Récupérer le fichier s'il existe
    if file and allowed_file(file.filename):  # Vérifier si un fichier valide est uploadé
        filename = secure_filename(file.filename)
        file_name_only = os.path.basename(filename)
        file.save(os.path.join(creation_upload_dossier("photo_profile"), file_name_only))
        champs_a_mettre_a_jour.append(("photo", file_name_only))
    mot_de_passe = request.form.get('mot_de_passe')
    if mot_de_passe:
        mot_de_passe_hash = bcrypt.hashpw(mot_de_passe.encode('utf-8'), bcrypt.gensalt())
        champs_a_mettre_a_jour.append(("mot_de_passe", mot_de_passe_hash))

    # Construire dynamiquement la requête SQL
    set_clause = ", ".join([f"{champ} = ?" for champ, _ in champs_a_mettre_a_jour])
    valeurs = [valeur for _, valeur in champs_a_mettre_a_jour]
    valeurs.append(id)

    connexion = connect_db()
    curseur = connexion.cursor()
    curseur.execute(f"UPDATE utilisateurs SET {set_clause} WHERE id = ?", valeurs)
    connexion.commit()
    connexion.close()

    return redirect(url_for('afficher_employés'))

@app.route('/api/récupérer_assignations', methods=['GET'])
def récupérer_assignations():
    if 'role' not in session or session['role'] != 'admin':
        return jsonify({"error": "Unauthorized access"}), 401

    connexion = connect_db()
    curseur = connexion.cursor()

    # Récupérer les assignations
    curseur.execute("""
        SELECT m.id AS manager_id, m.nom AS manager_nom, 
               s.id AS supervise_id, s.nom AS supervise_nom
        FROM managers
        JOIN utilisateurs m ON managers.id_manager = m.id
        JOIN utilisateurs s ON managers.id_supervise = s.id
    """)
    assignations = curseur.fetchall()
    connexion.close()

    # Convertir les résultats en une liste de dictionnaires
    result = []
    for assignation in assignations:
        result.append({
            "manager_id": assignation["manager_id"],
            "manager_nom": assignation["manager_nom"],
            "supervise_id": assignation["supervise_id"],
            "supervise_nom": assignation["supervise_nom"]
        })

    return jsonify(result)


@app.route('/assigner_manager', methods=['GET', 'POST'])
def assigner_manager():
    if 'role' not in session or session['role'] != 'admin':
        return redirect(url_for('login'))

    connexion = connect_db()
    curseur = connexion.cursor()

    # Récupérer les managers et employés disponibles
    curseur.execute("SELECT id, nom, email FROM utilisateurs WHERE role = 'manager'")
    managers = curseur.fetchall()

    curseur.execute("SELECT id, nom, email FROM utilisateurs WHERE role = 'employe'")
    employes = curseur.fetchall()

    # Récupérer l'ID du directeur
    curseur.execute("SELECT id FROM utilisateurs WHERE is_director = 1")
    directeur = curseur.fetchone()
    directeur_id = directeur["id"] if directeur else None

    # Exclure le directeur et le manager sélectionné des supervisés
    if request.method == 'POST':
        id_manager = request.form.get('manager')
        id_supervise = request.form.get('supervise')

        try:
            if id_manager == id_supervise:
                flash("Un manager ne peut pas se superviser lui-même.", "error")
            else:
                curseur.execute("""
                    INSERT INTO managers (id_manager, id_supervise)
                    VALUES (?, ?)
                """, (id_manager, id_supervise))
                connexion.commit()
                flash("Supervision assignée avec succès.", "success")
        except sqlite3.IntegrityError:
            flash("Cette supervision existe déjà.", "error")

    # Récupérer les assignations actuelles
    curseur.execute("""
        SELECT m.id AS manager_id, m.nom AS manager_nom, 
               e.id AS supervise_id, e.nom AS supervise_nom
        FROM managers
        JOIN utilisateurs m ON managers.id_manager = m.id
        JOIN utilisateurs e ON managers.id_supervise = e.id
    """)
    assignations = curseur.fetchall()

    connexion.close()

    return render_template(
        'assigner_manager.html',
        managers=managers,
        employes=employes,
        assignations=assignations,
        directeur_id=directeur_id
    )

@app.route('/api/récupérer_user_infos', methods=['GET'])
def récupérer_user_infos():
    user_id = request.args.get('user_id')
    user_type = request.args.get('user_type')

    if not user_id or not user_type:
        return jsonify({"error": "Missing parameters"}), 400

    connexion = connect_db()
    connexion.row_factory = sqlite3.Row
    curseur = connexion.cursor()

    def row_to_dict(row):
        return dict(row)

    try:
        if user_type == "directeur":
            curseur.execute("""
                SELECT id, nom, email FROM utilisateurs WHERE id = ? AND is_director = 1
            """, (user_id,))
            directeur = curseur.fetchone()

            if directeur:
                directeur = row_to_dict(directeur)
                curseur.execute("""
                    SELECT u.id, u.nom, u.email FROM managers
                    JOIN utilisateurs u ON managers.id_supervise = u.id
                    WHERE managers.id_manager = ?
                """, (directeur['id'],))
                directeur['supervises'] = [row_to_dict(row) for row in curseur.fetchall()]
                return jsonify({"directeur": directeur}), 200
            else:
                return jsonify({"error": "Directeur introuvable"}), 404

        elif user_type == "manager":
            curseur.execute("""
                SELECT id, nom, email FROM utilisateurs WHERE id = ? AND role = 'manager'
            """, (user_id,))
            manager = curseur.fetchone()

            if manager:
                manager = row_to_dict(manager)
                curseur.execute("""
                    SELECT u.id, u.nom, u.email FROM managers
                    JOIN utilisateurs u ON managers.id_supervise = u.id
                    WHERE managers.id_manager = ?
                """, (manager['id'],))
                manager['supervises'] = [row_to_dict(row) for row in curseur.fetchall()]
                curseur.execute("""
                    SELECT id, nom, email FROM utilisateurs WHERE id = (
                        SELECT id_manager FROM managers WHERE id_supervise = ?
                    )
                """, (manager['id'],))
                parent_manager = curseur.fetchone()
                manager['directeur'] = row_to_dict(parent_manager) if parent_manager else None
                return jsonify({"manager": manager}), 200
            else:
                return jsonify({"error": "Manager introuvable"}), 404

        elif user_type == "employe":
            curseur.execute("""
                SELECT id, nom, email FROM utilisateurs WHERE id = ? AND role = 'employe'
            """, (user_id,))
            employe = curseur.fetchone()

            if employe:
                employe = row_to_dict(employe)
                curseur.execute("""
                    SELECT id, nom, email FROM utilisateurs WHERE id = (
                        SELECT id_manager FROM managers WHERE id_supervise = ?
                    )
                """, (employe['id'],))
                manager = curseur.fetchone()
                employe['manager'] = row_to_dict(manager) if manager else None
                return jsonify({"employe": employe}), 200
            else:
                return jsonify({"error": "Employé introuvable"}), 404

    except Exception as e:
        print(f"Erreur: {e}")
        return jsonify({"error": "Une erreur est survenue"}), 500

    finally:
        connexion.close()

@app.route('/api/récupérer_orgchart', methods=['GET'])
def récupérer_orgchart():
    if 'role' not in session or session['role'] != 'admin':
        return jsonify({"error": "Unauthorized access"}), 401

    connexion = connect_db()
    curseur = connexion.cursor()

    # Récupérer le directeur
    curseur.execute("SELECT id, nom FROM utilisateurs WHERE is_director = 1")
    directeur = curseur.fetchone()

    if not directeur:
        return jsonify({"error": "No director found"}), 400

    # Construire l'arbre de l'organigramme
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
    print(jsonify(orgchart_data))
    return jsonify(orgchart_data)


@app.route('/designer_directeur', methods=['POST'])
def designer_directeur():
    if 'role' not in session or session['role'] != 'admin':
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
    if 'role' not in session or session['role'] != 'admin':
        return redirect(url_for('login'))

    connexion = connect_db()
    curseur = connexion.cursor()

    try:
        # Vérifier si l'assignation existe
        curseur.execute(
            "SELECT id_manager, id_supervise FROM managers WHERE id_manager = ? AND id_supervise = ?",
            (manager_id, supervise_id)
        )
        assignation = curseur.fetchone()

        if assignation:
            # Supprimer l'assignation
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


@app.route('/manager_dashboard')
def manager_dashboard():
    # Vérifiez si l'utilisateur est connecté et s'il est un manager
    if 'role' not in session or session['role'] != 'manager':
        return redirect(url_for('login'))

    manager_id = session['id']  # Récupérez l'ID du manager depuis la session
    connexion = connect_db()
    curseur = connexion.cursor()

    # Récupérez les employés supervisés par ce manager
    curseur.execute("""
        SELECT u.id, u.nom, u.prenom, u.date_naissance, u.poste, u.departement, u.email, u.photo,
               (CASE WHEN EXISTS (
                   SELECT 1 FROM demandes_congé WHERE demandes_congé.id_utilisateurs = u.id AND demandes_congé.statut = 'en attente'
               ) THEN 1 ELSE 0 END) AS conge_demande
        FROM utilisateurs u
        JOIN managers m ON m.id_supervise = u.id
        WHERE m.id_manager = ?
    """, (manager_id,))
    employees = curseur.fetchall()

    connexion.close()

    # Passez les données au modèle HTML
    return render_template('manager_menu.html', employees=employees,role= session['role'])

def récupérer_congés_acceptes():
    """
    Récupérer toutes les demandes de congé acceptées.
    """
    connexion = connect_db()
    cur = connexion.cursor()
    
    cur.execute("SELECT * FROM demandes_congé WHERE statut = 'accepte'")
    demandes = cur.fetchall()
    
    connexion.close()
    return demandes

def générer_couleur():
    """
    Générer une couleur pastel aléatoire adaptée à un fond blanc.
    """
    r = randint(0, 200)
    g = randint(0, 200)
    b = randint(0, 200)
    return f'rgb({r}, {g}, {b})'

@app.route("/calendrier_congés")
def calendrier_congés():
    """
    Afficher le calendrier des congés acceptés.
    """
    if 'role' not in session or session['role'] not in ['admin', 'manager']:
        return redirect(url_for('login'))

    connexion = connect_db()
    cur = connexion.cursor()

    if session['role'] == 'admin':
        # Récupérer tous les congés acceptés
        cur.execute("""
            SELECT dc.id_utilisateurs, dc.date_debut, dc.date_fin, dc.description, u.email 
            FROM demandes_congé dc
            JOIN utilisateurs u ON dc.id_utilisateurs = u.id
            WHERE dc.statut = 'accepte'
        """)
    elif session['role'] == 'manager':
        # Récupérer les congés acceptés des employés supervisés par ce manager
        manager_id = session['id']
        cur.execute("""
            SELECT dc.id_utilisateurs, dc.date_debut, dc.date_fin, dc.description, u.email 
            FROM demandes_congé dc
            JOIN utilisateurs u ON dc.id_utilisateurs = u.id
            JOIN managers m ON m.id_supervise = dc.id_utilisateurs
            WHERE dc.statut = 'accepte' AND m.id_manager = ?
        """, (manager_id,))

    conges_acceptes = cur.fetchall()
    connexion.close()

    # Construire le dictionnaire des congés par jour
    conges_par_jour = {}
    for conge in conges_acceptes:
        id_utilisateur, date_debut, date_fin, description, email = conge
        couleur = générer_couleur()  # Couleur personnalisée pour chaque employé
        employe = {
            'id_utilisateur': id_utilisateur,
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

    return render_template("calendrier_congés.html", conges_par_jour=conges_par_jour, role=session['role'])


@app.route('/soumettre_demande_arrêt', methods=['GET', 'POST'])
def soumettre_demande_arrêt():
    # Vérifiez si l'utilisateur est connecté
    if 'email' not in session:
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))

    if request.method == 'POST':
        # Récupérez l'email depuis la session
        employe_email = session['email']
        type_maladie = request.form['type_maladie']
        description = request.form['description']
        
        # Validation de la date de début côté serveur
        today = datetime.today().date()
        # Convertir les dates de chaîne en objet datetime
        date_debut = datetime.strptime(request.form['date_debut'], "%Y-%m-%d").date()
        date_fin = datetime.strptime(request.form['date_fin'], "%Y-%m-%d").date()

        
        if date_debut < today:
            flash("La date de début ne peut pas être avant la date actuelle.", "error")
            return render_template('soumettre_demande_arrêt.html')

        # Traitement du fichier joint
        file = request.files['piece_jointe']
        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            file_path = os.path.join(creation_upload_dossier("arréts"), filename)
            file.save(file_path)
        else:
            filename = None

        # Enregistrement dans la base de données
        connexion = connect_db()
        cur = connexion.cursor()
        cur.execute("""
            INSERT INTO demandes_arrêt (employe_email, type_maladie, date_debut, date_fin, description, piece_jointe)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            employe_email,
            type_maladie,
            date_debut.strftime('%Y-%m-%d'),
            date_fin.strftime('%Y-%m-%d'),
            description,
            filename
        ))
        connexion.commit()
        connexion.close()

        # 📧 Envoi d'un email de confirmation
        sujet = "Confirmation de dépôt d'arrêt maladie"
        contenu = f"Bonjour,\n\nVotre demande d'arrêt maladie pour {type_maladie} a été déposée avec succès.\n\nCordialement,\nL'équipe RH"
        envoyer_email(sujet, employe_email, contenu)
        contenu=f"Une demande d'arrêt de {employe_email} à été deposer"
        creer_notification("admin@gmail.com", contenu, "Arret")
        return redirect(url_for('mes_demandes_d_arrêts'))

    return render_template('soumettre_demande_arrêt.html')


@app.route('/mes_demandes_d_arrêts')
def mes_demandes_d_arrêts():
    # Vérifiez si l'utilisateur est connecté
    if 'email' not in session:
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))
    
    # Récupérez l'email de l'utilisateur connecté depuis la session
    employe_email = session['email']
    
    # Connexion à la base de données et récupération des arrêts
    
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("SELECT * FROM demandes_arrêt WHERE employe_email = ?", (employe_email,))
    arrets = cur.fetchall()
    connexion.close()
    
    # Affichez les arrêts dans la page HTML
    return render_template('mes_demandes_d_arrêts.html', arrets=arrets)


@app.route('/afficher_demandes_arrêts', methods=['GET', 'POST'])
def afficher_demandes_arrêts():
    if 'role' not in session or session['role'] != 'admin':
        return redirect(url_for('login'))

    if request.method == 'POST':
        try:
            id = request.form['id']
            statut = request.form['statut']
            motif_refus = request.form.get('motif_refus', None)

            connexion = connect_db()
            cur = connexion.cursor()
            cur.execute("SELECT employe_email FROM demandes_arrêt WHERE id = ?", (id,))
            employe_email = cur.fetchone()[0]

            if statut == 'refuse':
                cur.execute("""
                    UPDATE demandes_arrêt
                    SET statut = ?, motif_refus = ?
                    WHERE id = ?
                """, (statut, motif_refus, id))

                # 📧 Envoi d'un email de refus
                sujet = "Refus de votre demande d'arrêt maladie"
                contenu = f"Bonjour,\n\nVotre demande d'arrêt maladie a été refusée pour le motif suivant : {motif_refus}.\n\nCordialement,\nL'équipe RH"
            else:
                cur.execute("""
                    UPDATE demandes_arrêt
                    SET statut = ?, motif_refus = NULL
                    WHERE id = ?
                """, (statut, id))

                # 📧 Envoi d'un email d'acceptation
                sujet = "Acceptation de votre demande d'arrêt maladie"
                contenu = f"Bonjour,\n\nVotre demande d'arrêt maladie a été acceptée.\n\nCordialement,\nL'équipe RH"

            connexion.commit()
            connexion.close()

            # 📧 Envoi de l'email
            envoyer_email(sujet, employe_email, contenu)
            creer_notification(employe_email, contenu, "Arrét")
        except KeyError:
            flash("Une erreur s'est produite : l'ID est manquant.", "danger")

    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("SELECT * FROM demandes_arrêt")
    arrets = cur.fetchall()
    connexion.close()
    return render_template('admin_arrêts.html', arrets=arrets)



@app.route("/supprimer_demande_arrêts/<int:id>", methods=["POST"])
def supprimer_demande_arrêts(id):
    """
    Supprimer une demande d'arrêt. L'administrateur ou le manager peut supprimer les demandes.
    """
    if 'role' not in session or (session['role'] != 'admin' and session['role'] != 'manager'):
        return redirect(url_for('login'))

    # Connexion à la base de données
    connexion = connect_db()
    curseur = connexion.cursor()

    # Récupérer l'email de l'utilisateur connecté
    email_utilisateur = session['email']

    # Si c'est un manager, vérifier qu'il peut supprimer la demande d'arrêt
    if session['role'] == 'manager':
        curseur.execute("""
            SELECT 1 FROM managers 
            WHERE id_manager = (SELECT id FROM utilisateurs WHERE email = ?) 
            AND id_employe = (SELECT id_employe FROM demandes_arrêt WHERE id = ?)
        """, (email_utilisateur, id))
        if not curseur.fetchone():
            connexion.close()
            return "Vous n'avez pas l'autorisation de supprimer cette demande.", 403

    # Supprimer la demande d'arrêt
    curseur.execute("DELETE FROM demandes_arrêt WHERE id = ?", (id,))
    connexion.commit()
    connexion.close()

    # Retourner une redirection vers la page des demandes d'arrêt
    flash("La demande d'arrêt a été supprimée avec succès.", "success")
    return redirect(url_for('afficher_demandes_arrêts'))

def envoyer_email(sujet, destinataire, contenu):
    message = Message(
        subject=sujet,
        body=contenu,
        sender=app.config['MAIL_USERNAME'],  # Correctement configuré
        recipients=[destinataire]  # Utilise "recipients" au lieu de "to"
    )
    try:
        mail.send(message)
        print(f"Email envoyé à {destinataire}")
    except Exception as e:
        print(f"Erreur lors de l'envoi du mail : {e}")

@app.route('/envoyer_email_reinitialisation')
def envoyer_email_reinitialisation():
    email = request.args.get('email')
    
    if not email:
        return jsonify({'success': False, 'error': 'Email non fourni'}), 400
    
    # Générer un lien unique de réinitialisation de mot de passe
    lien_reinitialisation = f"http://localhost:5000/update_password?email={email}"
    
    # Contenu de l'email
    sujet = "Réinitialisation de votre mot de passe"
    contenu = f"Bonjour,\n\nCliquez sur le lien suivant pour réinitialiser votre mot de passe : {lien_reinitialisation}\n\nCordialement,\nL'équipe RH."
    
    try:
        envoyer_email(sujet, email, contenu)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/reset_password', methods=["GET", "POST"])
def reset_password():
    if request.method == "POST":
        email = request.form['email']
        lien = "http://localhost:5000/update_password"  # À personnaliser
        contenu = f"Bonjour,\n\nPour réinitialiser votre mot de passe, cliquez sur le lien suivant : {lien}"
        envoyer_email("Réinitialisation de mot de passe", email, contenu)
        flash("Un email de réinitialisation a été envoyé.")
        return redirect(url_for('reset_password.html'))

    return render_template('reset_password.html')

@app.route('/update_password', methods=['GET', 'POST'])
def update_password():
    email = request.args.get('email')
    
    if request.method == 'POST':
        new_password = request.form['new_password']
        hashed_password = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt())

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

    return render_template('update_password.html', email=email)


@app.route("/modifier_mes_infos", methods=["GET", "POST"])
def modifier_mes_infos():
    if 'email' not in session:
        flash("Vous devez être connecté pour accéder à cette page.")
        return redirect(url_for('login'))

    email = session['email']
    connexion = connect_db()
    cur = connexion.cursor()

    if request.method == "POST":
        # Récupérer les données du formulaire
        nom = request.form['nom']
        prenom = request.form['prenom']
        date_naissance = request.form['date_naissance']
        adresse = request.form['adresse']
        ville = request.form['ville']
        code_postal = request.form['code_postal']
        pays = request.form['pays']
        nationalite = request.form['nationalite']
        telephone = request.form['telephone']

        # Mise à jour de la photo de profil si fournie
        file = request.files.get('photo')
        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            photo_path = os.path.join('static/uploads/photo_profile', filename)
            file.save(photo_path)
            cur.execute("""
                UPDATE utilisateurs
                SET nom = ?, prenom = ?, date_naissance = ?, adresse = ?, ville = ?, code_postal = ?, pays = ?, nationalite = ?, telephone = ?, photo = ?
                WHERE email = ?
            """, (nom, prenom, date_naissance, adresse, ville, code_postal, pays, nationalite, telephone, filename, email))
        else:
            cur.execute("""
                UPDATE utilisateurs
                SET nom = ?, prenom = ?, date_naissance = ?, adresse = ?, ville = ?, code_postal = ?, pays = ?, nationalite = ?, telephone = ?
                WHERE email = ?
            """, (nom, prenom, date_naissance, adresse, ville, code_postal, pays, nationalite, telephone, email))

        connexion.commit()
        connexion.close()

        return redirect(url_for('voir_mes_infos'))

    # Récupérer les informations actuelles de l'utilisateur
    cur.execute("""
        SELECT nom, prenom, date_naissance, email, adresse, ville, code_postal, pays, nationalite, telephone, photo
        FROM utilisateurs
        WHERE email = ?
    """, (email,))
    result = cur.fetchone()
    connexion.close()

    return render_template("modifier_mes_infos.html", result=result)

BASE_COFFRE_FORT = "static/coffre_fort/"

def generer_nom_fichier(type_document, nom, prenom, mois=None, annee=None, nom_document=None):
    random_digits = ''.join(random.choices(string.digits, k=8))
    if type_document == "bulletin":
        return f"{nom}.{prenom}_Bulletin_{mois}_{annee}_{random_digits}.pdf"
    elif type_document == "contrat":
        return f"{nom}.{prenom}_Contrat_{mois}_{annee}_{random_digits}.pdf"
    else:
        return f"{nom}.{prenom}_{nom_document}_{random_digits}.pdf"


@app.route('/deposer_document/<string:id_employe>', methods=['GET', 'POST'])
def deposer_document(id_employe):
    if 'role' not in session or session['role'] != 'admin':
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

    # Crée les dossiers s'ils n'existent pas
    os.makedirs(dossier_bulletins, exist_ok=True)
    os.makedirs(dossier_contrats, exist_ok=True)
    os.makedirs(dossier_autres, exist_ok=True)

    if request.method == 'POST':
        type_document = request.form['type_document']
        fichier = request.files['fichier']

        if not fichier or not allowed_file(fichier.filename):
            flash("Format de fichier non autorisé.", "danger")
            return redirect(request.url)

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
        cur.execute("SELECT email FROM utilisateurs WHERE id = ?", (id_employe,))
        destinataire = cur.fetchone()[0]
        sujet="Dépot de document"
        contenu = f"Bonjour,\n\nUn nouveau document a été déposer dans votre coffre fort.\n\nCordialement,\nEquipe RH."
        envoyer_email(sujet, destinataire, contenu)
        creer_notification(destinataire, contenu, "document")

    return render_template('deposer_document.html', employe=employe)

@app.route('/coffre_fort', methods=['GET', 'POST'])
def coffre_fort():
    if 'email' not in session:
        return redirect(url_for('login'))

    connexion = connect_db()
    cur = connexion.cursor()

    # Si l'utilisateur est admin
    if session.get('role') == 'admin':
        if request.method == 'POST':
            employe_id = request.form['employe_id']
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

                return render_template(
                    'coffre_fort.html', 
                    bulletins=bulletins, 
                    contrats=contrats, 
                    autres=autres, 
                    nom=nom, 
                    prenom=prenom, 
                    employe_id=employe_id,
                    role=session.get('role')
                )
            else:
                flash("Employé introuvable.", "danger")
                return redirect(url_for('coffre_fort'))

        # Charger la liste des employés
        cur.execute("SELECT id, nom, prenom FROM utilisateurs WHERE id != 0")
        employes = cur.fetchall()
        return render_template('coffre_fort_admin.html', employes=employes)

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

        return render_template(
            'coffre_fort.html', 
            bulletins=bulletins, 
            contrats=contrats, 
            autres=autres, 
            nom=nom, 
            prenom=prenom, 
            employe_id=employe_id,
            role=session.get('role'),
        )


"""@app.errorhandler(404)
def page_not_found(e):
    return render_template('404.html'), 404

@app.errorhandler(500)
def server_error(e):
    return render_template('500.html'), 500"""

def creer_notification(email, message, type_notification):
    connexion = connect_db()
    cur = connexion.cursor()

    date_creation = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

    cur.execute("SELECT 1 FROM utilisateurs WHERE email = ?", (email,))
    if not cur.fetchone():
        print("Utilisateur introuvable.")
        connexion.close()
        return False

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
    connexion.close()
    print(f"Notification créée pour {email}.")
    return True


def récupérer_notifications(email):
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
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        UPDATE notifications
        SET is_read = 1
        WHERE email = ?
    """, (email,))
    connexion.commit()
    connexion.close()

@app.route('/mark_notifications_as_read', methods=['POST'])
def mark_notifications_as_read():
    if 'email' not in session:
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
    try:
        connexion = connect_db()
        cur = connexion.cursor()
        cur.execute("DELETE FROM notifications WHERE id = ?", (id,))
        connexion.commit()
        connexion.close()
        return jsonify({'success': True})
    except Exception as e:
        print(f"Erreur : {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/soumettre_demande_prime', methods=['GET', 'POST'])
def soumettre_demande_prime():
    if 'role' not in session or session['role'] != 'manager':
        return redirect(url_for('login'))

    id_manager = session['id']  # Récupérer l'ID du manager connecté
    manager_email = session['email']  # Récupérer l'e-mail du manager connecté

    if request.method == 'POST':
        id_employe = request.form['id_employe']
        montant = float(request.form['montant'])
        motif = request.form['motif']

        # Connexion à la base de données et insertion de la demande
        connexion = connect_db()
        cur = connexion.cursor()
        cur.execute("""
            INSERT INTO demandes_prime (id_manager, id_employe, montant, motif)
            VALUES (?, ?, ?, ?)
        """, (id_manager, id_employe, montant, motif))

        # Récupérer les informations de l'employé
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

        # Récupérer les détails de l'employé
        if employe:
            nom_employe, prenom_employe, employe_email = employe
            nom_manager , prenom_manager = manager
            # Création du contenu de l'e-mail et de la notification
            sujet = "Nouvelle demande de prime soumise"
            contenu = f"Bonjour,\n\nUne demande de prime a été soumise par votre manager {nom_manager} {prenom_manager} pour vous.\n\nMontant demandé : {montant}€\nMotif : {motif}\n\nCordialement,\nL'équipe RH."

            # 📧 Envoi de l'e-mail
            envoyer_email(sujet, "employe_email", contenu)
            contenu = f"Bonjour,\n\nUne demande de prime a été soumise par vous pour l'employé {nom_employe} {prenom_employe}.\n\nMontant demandé : {montant}€\nMotif : {motif}\n\nCordialement,\nL'équipe RH."

            envoyer_email(sujet, "employe_email", contenu)

            #Création de la notification
            creer_notification("admin@gmail.com", contenu, "Prime")

        flash("Demande de prime soumise avec succès.", "success")
        return redirect(url_for('manager_dashboard'))

    # Récupérer les employés supervisés par ce manager
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        SELECT u.id, u.nom, u.prenom
        FROM utilisateurs u
        JOIN managers m ON m.id_supervise = u.id
        WHERE m.id_manager = ?
    """, (id_manager,))
    employes = cur.fetchall()
    connexion.close()

    return render_template('soumettre_demande_prime.html', employes=employes)


@app.route('/afficher_demandes_prime')
def afficher_demandes_prime():
    if 'role' not in session or session['role'] != 'admin':
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

    return render_template('voir_demandes_prime.html', demandes=demandes)

@app.route('/traiter_demande_prime/<int:id>', methods=['POST'])
def traiter_demande_prime(id):
    if 'role' not in session or session['role'] != 'admin':
        return redirect(url_for('login'))

    statut = request.form['statut']
    motif_refus = request.form.get('motif_refus')

    # Connexion à la base de données
    connexion = connect_db()
    cur = connexion.cursor()

    # Récupérer les détails de la demande de prime
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

    # Mettre à jour la demande de prime en fonction du statut
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

    # Valider les modifications dans la base de données
    connexion.commit()
    connexion.close()

    # 📧 Envoi de l'email et création de la notification
    envoyer_email(sujet, manager_email, contenu)
    creer_notification(manager_email, contenu, "Prime")

    flash("Demande de prime traitée avec succès.", "success")
    return redirect(url_for('afficher_demandes_prime'))

@app.route('/supprimer_demande_prime/<int:id>', methods=['POST'])
def supprimer_demande_prime(id):
    if 'role' not in session or session['role'] != 'admin':
        return redirect(url_for('login'))

    connexion = connect_db()
    cur = connexion.cursor()

    # Vérifiez si la demande existe
    cur.execute("SELECT * FROM demandes_prime WHERE id = ?", (id,))
    demande = cur.fetchone()

    if not demande:
        flash("La demande de prime n'existe pas.", "danger")
        connexion.close()
        return redirect(url_for('afficher_demandes_prime'))

    # Supprimez la demande
    cur.execute("DELETE FROM demandes_prime WHERE id = ?", (id,))
    connexion.commit()
    connexion.close()

    flash("La demande de prime a été supprimée avec succès.", "success")
    return redirect(url_for('afficher_demandes_prime'))

# Route to schedule a meeting (Manager)
@app.route('/meetings_scheduler', methods=['GET', 'POST'])
def meetings_scheduler():
    if 'role' not in session or session['role'] != 'manager':
        return redirect(url_for('login'))

    connexion = connect_db()
    cur = connexion.cursor()

    if request.method == 'POST':
        title = request.form['title']
        date_time = request.form['date_time']
        invited_employees = request.form.getlist('employees')

        # Insert the new meeting
        cur.execute("""
            INSERT INTO meetings (title, date_time, status)
            VALUES (?, ?, 'Scheduled')
        """, (title, date_time))
        meeting_id = cur.lastrowid

        # Insert invited employees
        for employee_id in invited_employees:
            cur.execute("""
                INSERT INTO meeting_attendance (meeting_id, employee_id, status)
                VALUES (?, ?, 'Pending')
            """, (meeting_id, employee_id))

        connexion.commit()
        connexion.close()
        flash("L'invitation pour la réunion a été envoyer !", 'success')
        return redirect(url_for('meetings_scheduler'))

    # Retrieve employees for the form
    cur.execute("SELECT id, nom, prenom FROM utilisateurs WHERE role = 'employe'")
    employees = cur.fetchall()

    # Retrieve meetings for the manager to view
    cur.execute("""
        SELECT m.id, m.title, m.date_time, COUNT(a.id) AS invited_count, 
        SUM(CASE WHEN a.status = 'Accepted' THEN 1 ELSE 0 END) AS accepted_count,
        SUM(CASE WHEN a.status = 'Rejected' THEN 1 ELSE 0 END) AS rejected_count
        FROM meetings m
        JOIN meeting_attendance a ON m.id = a.meeting_id
        GROUP BY m.id
        ORDER BY m.date_time DESC
    """)
    meetings = cur.fetchall()

    connexion.close()
    return render_template('meetings_scheduler.html', employees=employees, meetings=meetings)


# Route for employees to view and respond to meeting invitations
@app.route('/meeting_invitations', methods=['GET', 'POST'])
def meeting_invitations():
    if 'role' not in session or session['role'] != 'employe':
        return redirect(url_for('login'))

    employee_id = session['id']
    connexion = connect_db()
    cur = connexion.cursor()

    if request.method == 'POST':
        meeting_id = request.form['meeting_id']
        response = request.form['response']

        cur.execute("""
            UPDATE meeting_attendance
            SET status = ?
            WHERE meeting_id = ? AND employee_id = ?
        """, (response, meeting_id, employee_id))
        connexion.commit()
        flash('Ta réponse a été enregistrer !', 'success')

    # Retrieve meeting invitations for the employee
    cur.execute("""
        SELECT m.id, m.title, m.date_time, a.status
        FROM meetings m
        JOIN meeting_attendance a ON m.id = a.meeting_id
        WHERE a.employee_id = ?
    """, (employee_id,))
    invitations = cur.fetchall()

    connexion.close()
    return render_template('meeting_invitations.html', invitations=invitations)
@app.template_filter('format_datetime')
def format_datetime(value, format='%d-%m-%Y %H:%M'):
    if isinstance(value, datetime):
        return value.strftime(format)
    return value

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for('login'))


initialiser_base_de_donnees()
if __name__ == "__main__":
    mail = Mail(app)
    app.run(debug=True)
