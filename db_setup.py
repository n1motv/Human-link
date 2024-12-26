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
        SELECT name FROM sqlite_master WHERE type='table' AND name='users';
    """)
    table_exists = cur.fetchone() is not None
    connexion.close()
    return table_exists
def cree_table_utilisateurs():
    if verification_creation_table():
        return
    else :
        connexion = connect_db()
        cur = connexion.cursor()

        cur.execute("""
                    CREATE TABLE users(
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    nom TEXT , 
                    prenom TEXT, 
                    age INT , 
                    poste TEXT,
                    departement TEXT, 
                    email type UNIQUE, 
                    mot_de_passe TEXT,
                    conge FLOAT,
                    salaire FLOAT,
                    dernier_mois_maj TEXT,
                    role TEXT)""")
        connexion.commit()
        connexion.close()
def verification_creation_table_conges():
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        SELECT name FROM sqlite_master WHERE type='table' AND name='conges';
    """)
    table_exists = cur.fetchone() is not None
    connexion.close()
    return table_exists



def cree_table_conges():
    if verification_creation_table_conges():
        print("Table des congés déjà créée.")
        return
    else:
        
        connexion = connect_db()
        cur = connexion.cursor()
        cur.execute("""
            CREATE TABLE conges(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT,
                raison TEXT,
                date_debut DATE,
                date_fin DATE,
                plus_infos TEXT,
                statut TEXT DEFAULT 'en attente',
                motif_refus TEXT,
                pièce_jointe
            )
        """)
        connexion.commit()
        connexion.close()
        print("Table des congés créée avec succès.")

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
        id_manager INTEGER NOT NULL,
        id_employe INTEGER NOT NULL,
        FOREIGN KEY (id_manager) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (id_employe) REFERENCES users (id) ON DELETE CASCADE,
        PRIMARY KEY (id_manager, id_employe)
    )
    """)
    connexion.commit()
    connexion.close()
    print("Table des managers créée avec succès.")

def verifier_admin_existe():
    connexion= connect_db()
    curseur = connexion.cursor()
    curseur.execute("SELECT * FROM users WHERE email = 'admin'")
    admin_existe= curseur.fetchone() is not None
    connexion.close()
    return admin_existe

def cree_compte_admin():
    if verifier_admin_existe() :
        return
    
    nom = "admin"
    prenom= "admin"
    age =30
    poste = "Administrateur"
    departement = "rh"
    email="admin"
    mot_de_passe = bcrypt.hashpw("admin".encode('utf-8'), bcrypt.gensalt())
    conge = 0
    salaire=0
    connexion = connect_db()
    curseur = connexion.cursor()

    curseur.execute("""
                    INSERT INTO users (nom,prenom,age,poste,departement,email,mot_de_passe,conge,salaire)
                    VALUES (?,?,?,?,?,?,?,?,?)
                    """,(nom,prenom,age,poste,departement,email,mot_de_passe,conge,salaire))
    connexion.commit()
    connexion.close()
    print("Compte admin crée avec succès. ")


def verification_creation_table_arrets_maladie():
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        SELECT name FROM sqlite_master WHERE type='table' AND name='arrets_maladie';
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
            CREATE TABLE arrets_maladie (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employe_email TEXT NOT NULL,
            type_maladie TEXT CHECK(type_maladie IN ('justifie', 'non justifie')),
            date_debut DATE NOT NULL,
            date_fin DATE NOT NULL,
            description TEXT,
            piece_jointe TEXT,
            statut TEXT DEFAULT 'en attente',
            motif_refus TEXT
            )
        """)
        connexion.commit()
        connexion.close()
        print("Table des arrets_maladie créée avec succès.")




