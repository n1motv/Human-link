import sqlite3
from argon2 import PasswordHasher
from dotenv import load_dotenv
import os
import atexit
import sqlite3
from cryptography.fernet import Fernet
from dotenv import load_dotenv

ph = PasswordHasher()



def cleanup():
    """Chiffre la base de données et supprime la version non chiffrée après utilisation."""
    if os.path.exists(DB_PATH):  # Vérifie si la base en clair existe
        encrypt_db()  # Chiffre la base
        if os.path.exists(DB_PATH):
            os.remove(DB_PATH)  # Supprime la version en clair

# Enregistrer la fonction `cleanup()` pour qu'elle s'exécute automatiquement à la fin
atexit.register(cleanup)

# Charger les variables d'environnement
load_dotenv()
DB_PATH = os.getenv("DB_PATH", "rh_data.db")
ENCRYPTED_DB_PATH = DB_PATH + ".enc"
KEY_PATH = "secret.key"
admin_email  = os.getenv('MAIL_USERNAME')
mot_de_passe  = os.getenv("MAIL_PASSWORD_APP")
# Charger la clé de chiffrement
def load_key():
    """Charge la clé de chiffrement depuis les variables d’environnement."""
    key = os.getenv("SECRET_KEY")
    if key is None:
        raise ValueError("🔴 ERREUR : La clé de chiffrement n'est pas définie dans les variables d'environnement !")
    return key.encode()

fernet = Fernet(load_key())

def encrypt_db():
    """Chiffre l'intégralité du fichier SQLite."""
    if not os.path.exists(DB_PATH):
        return  # Si la base n'existe pas, pas besoin de la chiffrer

    with open(DB_PATH, "rb") as file:
        encrypted_data = fernet.encrypt(file.read())

    with open(ENCRYPTED_DB_PATH, "wb") as file:
        file.write(encrypted_data)

    os.remove(DB_PATH)  # Supprimer la base en clair

def decrypt_db():
    """Déchiffre la base de données pour une utilisation temporaire."""
    if not os.path.exists(ENCRYPTED_DB_PATH):
        return  # Si la base chiffrée n'existe pas encore, pas besoin de déchiffrer

    with open(ENCRYPTED_DB_PATH, "rb") as file:
        decrypted_data = fernet.decrypt(file.read())

    with open(DB_PATH, "wb") as file:
        file.write(decrypted_data)


def connect_db():
    """Établit une connexion à la base SQLite déchiffrée."""
    if not os.path.exists(DB_PATH):
        decrypt_db()  # Déchiffre la base si elle n'existe pas en clair

    connexion = sqlite3.connect(DB_PATH)
    connexion.row_factory = sqlite3.Row
    return connexion

def table_exists(nom_table):
    """
    Vérifie si une table 'nom_table' existe déjà dans la base de données.
    Retourne True si elle existe, False sinon.
    """
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?;", (nom_table,))
    existe = (cur.fetchone() is not None)
    connexion.close()
    return existe

def cree_table_utilisateurs():
    """
    Crée la table 'utilisateurs' si elle n'existe pas encore.
    Contient toutes les informations de base d'un utilisateur (employé/admin/manager).
    """
    if table_exists('utilisateurs'):
        return

    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        CREATE TABLE utilisateurs(
            id TEXT PRIMARY KEY,
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
            pays TEXT,
            nationalite TEXT,
            numero_securite_sociale TEXT,
            date_embauche DATE,
            type_contrat TEXT CHECK (type_contrat IN ('CDI', 'CDD', 'Alternance', 'Stage', 'Freelance')),
            is_director BOOLEAN DEFAULT 0,
            teletravail_max INTEGER DEFAULT 0,
            tentative_echouee INTEGER DEFAULT 0,
            bloque_jusqu_a TIMESTAMP NULL
        );
    """)
    connexion.commit()
    connexion.close()
    print("Table 'utilisateurs' créée avec succès.")

def cree_table_conges():
    """
    Crée la table 'demandes_congé' si elle n'existe pas encore.
    Gère toutes les demandes de congés des employés.
    """
    if table_exists('demandes_congé'):
        return

    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        CREATE TABLE demandes_congé(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            id_utilisateurs TEXT NOT NULL,
            raison TEXT,
            date_debut DATE,
            date_fin DATE,
            description TEXT,
            statut TEXT DEFAULT 'en attente',
            statut_manager TEXT DEFAULT 'en attente',
            statut_admin TEXT DEFAULT 'en attente',
            motif_refus TEXT,
            pièce_jointe TEXT
        );
    """)
    connexion.commit()
    connexion.close()
    print("Table 'demandes_congé' créée avec succès.")

def cree_table_réunion():
    """
    Crée la table 'réunion' si elle n'existe pas encore.
    Gère les informations de base d'une réunion (titre, date et créateur).
    """
    if table_exists('réunion'):
        return

    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        CREATE TABLE réunion(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            date_time DATETIME NOT NULL,
            status TEXT DEFAULT 'Scheduled',
            created_by TEXT
        );
    """)
    connexion.commit()
    connexion.close()
    print("Table 'réunion' créée avec succès.")

def cree_table_réponse_réunion():
    """
    Crée la table 'réponse_réunion' si elle n'existe pas encore.
    Stocke les réponses (accepté, refusé, en attente) des employés invités à une réunion.
    """
    if table_exists('réponse_réunion'):
        return

    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        CREATE TABLE réponse_réunion(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            meeting_id INTEGER,
            employee_id TEXT,
            status TEXT DEFAULT 'en attente',
            FOREIGN KEY (meeting_id) REFERENCES réunion(id),
            FOREIGN KEY (employee_id) REFERENCES utilisateurs(id)
        );
    """)
    connexion.commit()
    connexion.close()
    print("Table 'réponse_réunion' créée avec succès.")

def cree_table_prime():
    """
    Crée la table 'demandes_prime' si elle n'existe pas encore.
    Gère les demandes de prime soumises par les managers pour leurs employés.
    """
    if table_exists('demandes_prime'):
        return

    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        CREATE TABLE demandes_prime(
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
        );
    """)
    connexion.commit()
    connexion.close()
    print("Table 'demandes_prime' créée avec succès.")

def cree_table_managers():
    """
    Crée la table 'managers' si elle n'existe pas encore.
    Permet d'établir une relation manager -> employé supervisé.
    """
    if table_exists('managers'):
        return

    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        CREATE TABLE managers(
            id_manager TEXT NOT NULL,
            id_supervise TEXT NOT NULL,
            PRIMARY KEY (id_manager, id_supervise),
            FOREIGN KEY (id_manager) REFERENCES utilisateurs (id) ON DELETE CASCADE,
            FOREIGN KEY (id_supervise) REFERENCES utilisateurs (id) ON DELETE CASCADE
        );
    """)
    connexion.commit()
    connexion.close()
    print("Table 'managers' créée avec succès.")

def cree_table_notifications():
    """
    Crée la table 'notifications' si elle n'existe pas encore.
    Gère toutes les notifications envoyées à un utilisateur (employé ou manager).
    """
    if table_exists('notifications'):
        return

    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        CREATE TABLE notifications(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL,
            message TEXT NOT NULL,
            type TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_read INTEGER DEFAULT 0
        );
    """)
    connexion.commit()
    connexion.close()
    print("Table 'notifications' créée avec succès.")

def cree_table_arrets_maladie():
    """
    Crée la table 'demandes_arrêt' si elle n'existe pas encore.
    Gère les arrêts maladie (justifiés ou non) déposés par les employés.
    """
    if table_exists('demandes_arrêt'):
        return

    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        CREATE TABLE demandes_arrêt(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employe_email TEXT NOT NULL,
            type_maladie TEXT CHECK(type_maladie IN ('justifie', 'non justifie')),
            date_debut DATE NOT NULL,
            date_fin DATE NOT NULL,
            description TEXT,
            statut TEXT DEFAULT 'en attente',
            motif_refus TEXT,
            piece_jointe TEXT
        );
    """)
    connexion.commit()
    connexion.close()
    print("Table 'demandes_arrêt' créée avec succès.")

def cree_table_teletravail():
    """
    Crée la table 'teletravail' si elle n'existe pas encore.
    Gère les jours de télétravail planifiés par les employés.
    """
    if table_exists('teletravail'):
        return

    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        CREATE TABLE teletravail(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            id_employe TEXT NOT NULL,
            date_teletravail DATE NOT NULL,
            FOREIGN KEY (id_employe) REFERENCES utilisateurs(id)
        );
    """)
    connexion.commit()
    connexion.close()
    print("Table 'teletravail' créée avec succès.")

def cree_table_demandes_contact():
    """
    Crée la table 'demandes_contact' si elle n'existe pas encore.
    Gère les demandes de contact envoyées depuis la page de contact (employé connecté ou simple visiteur).
    """
    if table_exists('demandes_contact'):
        return

    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        CREATE TABLE demandes_contact(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            id_utilisateur TEXT,
            nom TEXT,
            prenom TEXT,
            telephone TEXT,
            email TEXT NOT NULL,
            sujet TEXT NOT NULL,
            message TEXT NOT NULL,
            date_creation DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (id_utilisateur) REFERENCES utilisateurs(id)
        );
    """)
    connexion.commit()
    connexion.close()
    print("Table 'demandes_contact' créée avec succès.")

def cree_table_feedback():
    connexion = connect_db()
    curseur = connexion.cursor()
    curseur.execute("""
        CREATE TABLE IF NOT EXISTS feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT, 
            rating_env INTEGER NOT NULL,           -- Environnement de travail
            rating_management INTEGER NOT NULL,      -- Management
            rating_worklife INTEGER NOT NULL,        -- Équilibre vie pro/perso
            rating_comm INTEGER NOT NULL,            -- Communication interne
            rating_recognition INTEGER NOT NULL,     -- Reconnaissance du travail
            rating_training INTEGER NOT NULL,        -- Opportunités de formation
            rating_equipment INTEGER NOT NULL,       -- Qualité des équipements
            rating_team INTEGER NOT NULL,            -- Ambiance d'équipe
            rating_meetings INTEGER NOT NULL,        -- Organisation des réunions
            rating_transparency INTEGER NOT NULL,    -- Transparence des informations
            suggestion TEXT,                         -- Suggestions libres
            created_at TEXT NOT NULL                 -- Date de soumission
        )
    """)
    connexion.commit()
    connexion.close()


def verifier_admin_existe():
    """
    Vérifie si un admin (avec l'email défini dans 'admin_email')
    existe déjà dans la table 'utilisateurs'.
    """
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("SELECT * FROM utilisateurs WHERE email = ?", (admin_email,))
    existe = (cur.fetchone() is not None)
    connexion.close()
    return existe

def cree_compte_admin():
    """
    Crée un compte administrateur basique (nom, prenom = 'admin', mot de passe = 'admin')
    si aucun compte admin n'existe déjà dans la base.
    """
    if verifier_admin_existe():
        return

    mot_de_passe_hash = ph.hash(mot_de_passe)

    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        INSERT INTO utilisateurs (
            nom, prenom, date_naissance, poste, departement,
            email, mot_de_passe, solde_congé, salaire, role
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?,?)
    """, (
        "admin", "admin", 30, "Administrateur", "RH",
        admin_email, mot_de_passe_hash, 0, 0 ,"admin"
    ))
    connexion.commit()
    connexion.close()
    print("Compte admin créé avec succès.")
