import sqlite3
from tabulate import tabulate
from getpass import getpass
import bcrypt
from datetime import datetime
from datetime import datetime, timedelta

def connect_db():
    return sqlite3.connect("rh_data.db")


def voir_employes():
    connexion = connect_db()
    curseur = connexion.cursor()
    curseur.execute("""
        SELECT nom, prenom, age, poste, departement, email, conge, salaire ,id, role  FROM users WHERE id != 1 ORDER BY id
    """)
    resultats = curseur.fetchall()
    print(resultats)
    connexion.close()
    return resultats

def ajouter_employe(nom, prenom, age, poste, departement, email, mot_de_passe, conge, salaire,role):
    mot_de_passe_hash = bcrypt.hashpw(mot_de_passe.encode('utf-8'), bcrypt.gensalt())
    connexion = connect_db()
    curseur = connexion.cursor()
    curseur.execute("""
        INSERT INTO users (nom, prenom, age, poste, departement, email, mot_de_passe, conge, salaire,role)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?,?)
    """, (nom, prenom, age, poste, departement, email, mot_de_passe_hash, conge, salaire,role))
    connexion.commit()
    connexion.close()


def repondre_demande_conge(id_demande, statut, motif_refus=None):
    connexion = connect_db()
    curseur = connexion.cursor()
    curseur.execute("SELECT * FROM conges WHERE id = ?", (id_demande,))
    demande = curseur.fetchone()
    
    if demande:
        # Vérifie si le statut est déjà accepté ou refusé
        if demande[6] in ['accepte', 'refuse']:
            connexion.close()
            return False  # Ne fait rien si le statut est déjà finalisé

        email_employe = demande[1]
        date_debut = datetime.strptime(demande[3], '%Y-%m-%d')
        date_fin = datetime.strptime(demande[4], '%Y-%m-%d')
        nombre_jours = compter_jours_de_conge(date_debut, date_fin)
        curseur.execute("SELECT conge FROM users WHERE email = ?", (email_employe,))
        solde_conge = curseur.fetchone()

        if solde_conge and solde_conge[0] >= nombre_jours:
            if statut == 'accepte':
                nouveau_solde = solde_conge[0] - nombre_jours
                curseur.execute("UPDATE users SET conge = ? WHERE email = ?", (nouveau_solde, email_employe))
                curseur.execute("UPDATE conges SET statut = 'accepté' WHERE id = ?", (id_demande,))
            elif statut == 'refuse':
                curseur.execute("UPDATE conges SET statut = 'refusé', motif_refus = ? WHERE id = ?", (motif_refus, id_demande))
            connexion.commit()
            connexion.close()
            return True
        else:
            connexion.close()
            return False
    else:
        connexion.close()
        return False


def compter_jours_de_conge(date_debut, date_fin):
    jours_conge = 0
    date_courante = date_debut
    while date_courante <= date_fin:
        if date_courante.weekday() < 5:  # Exclure les week-ends
            jours_conge += 1
        date_courante += timedelta(days=1)
    return jours_conge
