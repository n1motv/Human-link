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
        SELECT mot_de_passe FROM users WHERE email = ?
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

# Fonction pour gérer la connexion utilisateur
def connexion_utilisateur():
    email = request.form.get("email")  # Récupère l'email du formulaire
    mot_de_passe = request.form.get("mot_de_passe")  # Récupère le mot de passe du formulaire
    role = request.form.get("role")  # Récupère le rôle choisi

    if verifier_identifiants(email, mot_de_passe):
        session['email'] = email  # Stocke l'email dans la session pour une utilisation ultérieure
        session['role'] = role

        if role == "admin" and email == "admin":
            # Redirection vers le menu admin
            return redirect(url_for('admin_menu'))
        elif role == "employe":
            # Redirection vers le menu employé
            return redirect(url_for('employe_menu'))
        else:
            # Si l'utilisateur a un rôle non autorisé
            return render_template("connexion.html", message="Accès refusé.")
    else:
        # Si les identifiants sont incorrects
        return render_template("connexion.html", message="Identifiants incorrects.")

# Menu principal pour les administrateurs
def afficher_admin_menu():
    if 'email' in session and session.get('role') == "admin":
        return render_template("admin_menu.html")
    else:
        return redirect(url_for('connexion'))

# Menu principal pour les employés
def afficher_menu_employe():
    if 'email' in session and session.get('role') == "employe":
        email = session.get('email')
        return render_template("employe_menu.html", email=email)
    else:
        return redirect(url_for('connexion'))

def get_demandes_conges_manager(manager_email):
    """
    Récupérer les demandes de congé des employés supervisés par ce manager.
    """
    connexion = connecter_db()
    cur = connexion.cursor()
    
    # Récupérer l'ID du manager
    cur.execute("SELECT id FROM users WHERE email = ?", (manager_email,))
    manager_id = cur.fetchone()
    
    if not manager_id:
        return []  # Aucun manager trouvé
    
    manager_id = manager_id['id']
    
    # Récupérer les ID des employés supervisés par ce manager
    cur.execute("""
        SELECT id_employe FROM managers WHERE id_manager = ?
    """, (manager_id,))
    employes_ids = [row['id_employe'] for row in cur.fetchall()]
    
    # Récupérer les demandes de congé pour ces employés
    demandes = []
    for employe_id in employes_ids:
        cur.execute("""
            SELECT * FROM conges WHERE email IN (SELECT email FROM users WHERE id = ?)
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
    
    cur.execute("SELECT * FROM conges")
    demandes = cur.fetchall()
    
    connexion.close()
    return demandes

