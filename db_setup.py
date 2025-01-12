import sqlite3
import bcrypt

def connect_db():
    connexion = sqlite3.connect("rh_data.db")
    connexion.row_factory = sqlite3.Row  # Pour permettre l'accès par nom aux colonnes
    return connexion

def verification_creation_table():
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        SELECT name FROM sqlite_master WHERE type='table' AND name='utilisateurs';
    """)
    table_exists = cur.fetchone() is not None
    connexion.close()
    return table_exists
def cree_table_utilisateurs():
    if verification_creation_table():
        return
    else:
        connexion = connect_db()
        cur = connexion.cursor()

        cur.execute("""
                    CREATE TABLE utilisateurs(
                    id TEXT PRIMARY KEY ,
                    nom TEXT, 
                    prenom TEXT, 
                    date_naissance DATE, 
                    poste TEXT,
                    departement TEXT, 
                    email TEXT UNIQUE, 
                    mot_de_passe TEXT,
                    solde_congé FLOAT,
                    salaire FLOAT,
                    dernier_mois_maj TEXT,
                    role TEXT,
                    photo TEXT DEFAULT 'default.jpg',
                    sexualite TEXT CHECK (sexualite IN ('Homme', 'Femme')),
                    telephone TEXT,
                    adresse TEXT,
                    ville TEXT,
                    code_postal TEXT,
                    pays TEXT ,
                    nationalite TEXT,
                    numero_securite_sociale TEXT,
                    date_embauche DATE,
                    type_contrat TEXT CHECK (type_contrat IN ('CDI', 'CDD', 'Alternance', 'Stage', 'Freelance')),
                    is_director BOOLEAN DEFAULT 0
                    )""")  # Colonne pour la photo
        connexion.commit()
        connexion.close()

def verification_creation_table_conges():
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        SELECT name FROM sqlite_master WHERE type='table' AND name='demandes_congé';
    """)
    table_exists = cur.fetchone() is not None
    connexion.close()
    return table_exists




def cree_table_conges():
    if verification_creation_table_conges():
        connexion = connect_db()
        cur = connexion.cursor()
        print("Table des congés déjà créée.")
        return
    else:
        
        connexion = connect_db()
        cur = connexion.cursor()
        cur.execute("""
            CREATE TABLE demandes_congé(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                id_utilisateurs INTEGER NOT NULL,
                raison TEXT,
                date_debut DATE,
                date_fin DATE,
                description TEXT,
                statut TEXT DEFAULT 'en attente',
                motif_refus TEXT,
                pièce_jointe TEXT
            )
        """)
        connexion.commit()
        connexion.close()
        print("Table des congés créée avec succès.")

def verification_creation_table_meetings():
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        SELECT name FROM sqlite_master WHERE type='table' AND name='meetings';
    """)
    table_exists = cur.fetchone() is not None
    connexion.close()
    return table_exists

def cree_table_meetings():
    if verification_creation_table_meetings():
        print("Table 'meetings' déjà créée.")
        return

    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        CREATE TABLE meetings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            date_time DATETIME NOT NULL,
            status TEXT DEFAULT 'Scheduled'
        )
    """)
    connexion.commit()
    connexion.close()
    print("Table 'meetings' créée avec succès.")


def verification_creation_table_meeting_attendance():
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        SELECT name FROM sqlite_master WHERE type='table' AND name='meeting_attendance';
    """)
    table_exists = cur.fetchone() is not None
    connexion.close()
    return table_exists

def cree_table_meeting_attendance():
    if verification_creation_table_meeting_attendance():
        print("Table 'meeting_attendance' déjà créée.")
        return

    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        CREATE TABLE meeting_attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            meeting_id INTEGER,
            employee_id INTEGER,
            status TEXT DEFAULT 'Pending',
            FOREIGN KEY (meeting_id) REFERENCES meetings(id),
            FOREIGN KEY (employee_id) REFERENCES utilisateurs(id)
        )
    """)
    connexion.commit()
    connexion.close()
    print("Table 'meeting_attendance' créée avec succès.")

def verification_creation_table_prime():
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        SELECT name FROM sqlite_master WHERE type='table' AND name='demandes_prime';
    """)
    table_exists = cur.fetchone() is not None
    connexion.close()
    return table_exists


def cree_table_prime():
    if verification_creation_table_prime():
        print("Table des demandes_prime déjà créée.")
        return

    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        CREATE TABLE demandes_prime (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            id_manager TEXT NOT NULL,
            id_employe TEXT NOT NULL,
            montant FLOAT NOT NULL,
            motif TEXT NOT NULL,
            statut TEXT DEFAULT 'en attente',
            motif_refus TEXT,
            date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (id_manager) REFERENCES utilisateurs(id),
            FOREIGN KEY (id_employe) REFERENCES utilisateurs(id)
        )
    """)
    connexion.commit()
    connexion.close()
    print("Table des demandes_prime créée avec succès.")
def verification_creation_table_manager():
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        SELECT name FROM sqlite_master WHERE type='table' AND name='managers';
    """)
    table_exists = cur.fetchone() is not None
    connexion.close()
    return table_exists

def cree_table_manager():
    if verification_creation_table_manager() :
        return
    connexion = connect_db()
    cur = connexion.cursor()

    cur.execute("""
        CREATE TABLE managers (
        id_manager TEXT NOT NULL,
        id_supervise TEXT NOT NULL,
        FOREIGN KEY (id_manager) REFERENCES utilisateurs (id) ON DELETE CASCADE,
        FOREIGN KEY (id_supervise) REFERENCES utilisateurs (id) ON DELETE CASCADE,
        PRIMARY KEY (id_manager, id_supervise)
    )
    """)
    connexion.commit()
    connexion.close()
    print("Table des managers créée avec succès.")


def cree_table_manager():
    connexion = connect_db()
    cur = connexion.cursor()

    cur.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            message TEXT NOT NULL,
            type TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_read INTEGER DEFAULT 0
        )
    """)
    connexion.commit()
    connexion.close()
    print("Table des notifications créée avec succès.")

def verifier_admin_existe():
    connexion= connect_db()
    curseur = connexion.cursor()
    curseur.execute("SELECT * FROM utilisateurs WHERE email = 'admin@gmail.com'")
    admin_existe= curseur.fetchone() is not None
    connexion.close()
    return admin_existe

def cree_compte_admin():
    if verifier_admin_existe() :
        return
    
    nom = "admin"
    prenom= "admin"
    date_naissance =30
    poste = "Administrateur"
    departement = "rh"
    email="admin@gmail.com"
    mot_de_passe = bcrypt.hashpw("admin".encode('utf-8'), bcrypt.gensalt())
    solde_congé = 0
    salaire=0
    connexion = connect_db()
    curseur = connexion.cursor()

    curseur.execute("""
                    INSERT INTO utilisateurs (nom,prenom,date_naissance,poste,departement,email,mot_de_passe,solde_congé,salaire)
                    VALUES (?,?,?,?,?,?,?,?,?)
                    """,(nom,prenom,date_naissance,poste,departement,email,mot_de_passe,solde_congé,salaire))
    connexion.commit()
    connexion.close()
    print("Compte admin crée avec succès. ")


def verification_creation_table_arrets_maladie():
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        SELECT name FROM sqlite_master WHERE type='table' AND name='demandes_arrêt';
    """)
    table_exists = cur.fetchone() is not None
    connexion.close()
    return table_exists



def cree_table_arrets_maladie():
    if verification_creation_table_arrets_maladie():
        print("Table des arrets maladie déjà créée.")
        return
    else:
        
        connexion = connect_db()
        cur = connexion.cursor()
        cur.execute("""
            CREATE TABLE demandes_arrêt (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employe_email TEXT NOT NULL,
            type_maladie TEXT CHECK(type_maladie IN ('justifie', 'non justifie')),
            date_debut DATE NOT NULL,
            date_fin DATE NOT NULL,
            description TEXT,
            statut TEXT DEFAULT 'en attente',
            motif_refus TEXT,    
            piece_jointe TEXT
            )
        """)
        connexion.commit()
        connexion.close()
        print("Table des demandes_arrêt créée avec succès.")




