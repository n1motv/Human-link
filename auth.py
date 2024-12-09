import sqlite3
import bcrypt
from flask import request, redirect, url_for, render_template, session

# Connexion à la base de données
def connecter_db():
    return sqlite3.connect("rh_data.db")

# Vérification des identifiants
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

# Connexion utilisateur
def connexion_utilisateur(role):
    email = request.form.get('email')  # Récupère l'email du formulaire
    mot_de_passe = request.form.get('mot_de_passe')  # Récupère le mot de passe du formulaire

    if verifier_identifiants(email, mot_de_passe):
        session['email'] = email  # Stocker l'email dans la session pour la gestion future

        if role == "admin" and email == "admin":
            return redirect(url_for('admin_menu'))  # Redirige vers le menu admin
        elif role == "employe":
            return redirect(url_for('employe_menu'))  # Redirige vers le menu employé
        else:
            return render_template("connexion.html", message="Accès refusé.")
    else:
        return render_template("connexion.html", message="Identifiants incorrects.")
