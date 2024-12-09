import sqlite3
import bcrypt

def connect_db():
    return sqlite3.connect("rh_data.db")
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
                    dernier_mois_maj TEXT)""")
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
                motif_refus TEXT
            )
        """)
        connexion.commit()
        connexion.close()
        print("Table des congés créée avec succès.")

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




