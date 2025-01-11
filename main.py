import sqlite3
import bcrypt
from flask import request, redirect, url_for, session, render_template

# Connexion à la base de données
def connecter_db():
    connexion = sqlite3.connect("rh_data.db")
    connexion.row_factory = sqlite3.Row  # Permet d'accéder aux colonnes par nom
    return connexion


# Vérification des identifiants dans la base de données
def verifier_identifiants(email, mot_de_passe):
    connexion = connecter_db()
    if connexion is None:
        return None
    curseur = connexion.cursor()
    curseur.execute("""
        SELECT mot_de_passe FROM utilisateurs WHERE email = ?
    """, (email,))
    resultats = curseur.fetchone()
    connexion.close()

    if resultats:
        mot_de_passe_hache = resultats[0]
        if isinstance(mot_de_passe_hache, str):
            mot_de_passe_hache = mot_de_passe_hache.encode('utf-8')
        if bcrypt.checkpw(mot_de_passe.encode('utf-8'), mot_de_passe_hache):
            return True
    return False

def get_demandes_conges_manager(manager_email):
    """
    Récupérer les demandes de congé des employés supervisés par ce manager.
    """
    connexion = connecter_db()
    cur = connexion.cursor()
    
    # Récupérer l'ID du manager
    cur.execute("SELECT id FROM utilisateurs WHERE email = ?", (manager_email,))
    manager_id = cur.fetchone()
    
    if not manager_id:
        return []  # Aucun manager trouvé
    
    manager_id = manager_id['id']
    
    # Récupérer les ID des employés supervisés par ce manager
    cur.execute("""
        SELECT id_supervise FROM managers WHERE id_manager = ?
    """, (manager_id,))
    employes_ids = [row['id_supervise'] for row in cur.fetchall()]
    
    # Récupérer les demandes de congé pour ces employés
    demandes = []
    for employe_id in employes_ids:
        cur.execute("""
            SELECT * FROM demandes_congé WHERE id_utilisateurs IN (SELECT id FROM utilisateurs WHERE id = ?)
        """, (employe_id,))
        demandes.extend(cur.fetchall())
    
    connexion.close()
    return demandes


def get_all_demandes_conges():
    """
    Récupérer toutes les demandes de congé pour un administrateur.
    """
    connexion = connecter_db()
    cur = connexion.cursor()
    
    cur.execute("SELECT * FROM demandes_congé")
    demandes = cur.fetchall()
    
    connexion.close()
    return demandes

