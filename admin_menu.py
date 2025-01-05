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
        SELECT nom, prenom, date_naissance, poste, departement, email, solde_congé, salaire,id,role , photo,sexualite,telephone,adresse,ville,code_postal,pays,nationalite,numero_securite_sociale,date_embauche,type_contrat  FROM utilisateurs WHERE id != "None" ORDER BY id
    """)
    resultats = curseur.fetchall()
    connexion.close()
    return resultats

def ajouter_employe(id_employe, nom, prenom, date_naissance, poste, departement, email, mot_de_passe, 
                solde_congé, salaire, role, file_name_only, sexualite, telephone, adresse, 
                ville, code_postal, pays, nationalite, numero_securite_sociale, date_embauche, type_contrat):
    mot_de_passe_hash = bcrypt.hashpw(mot_de_passe.encode('utf-8'), bcrypt.gensalt())
    connexion = connect_db()
    curseur = connexion.cursor()
    curseur.execute("""
        INSERT INTO utilisateurs (id,nom, prenom, date_naissance, poste, departement, email, mot_de_passe, solde_congé, salaire,role,photo,sexualite,telephone,adresse,ville,code_postal,pays,nationalite,numero_securite_sociale,date_embauche,type_contrat)
        VALUES (?,?, ?, ?, ?, ?, ?, ?, ?, ?,?,?,?, ?, ?, ?, ?, ?, ?, ?,?,?)
    """, (id_employe,nom, prenom, date_naissance, poste, departement, email, mot_de_passe_hash, solde_congé, salaire,role,file_name_only,sexualite, telephone, adresse, 
    ville, code_postal, pays, nationalite, numero_securite_sociale, date_embauche, type_contrat))
    connexion.commit()
    connexion.close()


def repondre_demande_conge(id_demande, statut, motif_refus=None):
    connexion = connect_db()
    curseur = connexion.cursor()
    curseur.execute("SELECT * FROM demandes_congé WHERE id = ?", (id_demande,))
    demande = curseur.fetchone()
    
    if demande:
        # Vérifie si le statut est déjà accepté ou refusé
        if demande[6] in ['accepte', 'refuse']:
            connexion.close()
            return False  # Ne fait rien si le statut est déjà finalisé

        id_employe = demande[1]
        date_debut = datetime.strptime(demande[3], '%Y-%m-%d')
        date_fin = datetime.strptime(demande[4], '%Y-%m-%d')
        nombre_jours = compter_jours_de_conge(date_debut, date_fin)
        curseur.execute("SELECT solde_congé FROM utilisateurs WHERE id = ?", (id_employe,))
        solde_conge = curseur.fetchone()

        if solde_conge and solde_conge[0] >= nombre_jours:
            if statut == 'accepte':
                nouveau_solde = solde_conge[0] - nombre_jours
                curseur.execute("UPDATE utilisateurs SET solde_congé = ? WHERE id = ?", (nouveau_solde, id_employe))
                curseur.execute("UPDATE demandes_congé SET statut = 'accepte' WHERE id = ?", (id_demande,))
            elif statut == 'refuse':
                curseur.execute("UPDATE demandes_congé SET statut = 'refuse', motif_refus = ? WHERE id = ?", (motif_refus, id_demande))
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
