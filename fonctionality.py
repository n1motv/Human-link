import sqlite3
from datetime import datetime

def connect_db():
    return sqlite3.connect("rh_data.db")


def ajouter_conge_mensuel():
    mois_actuel = datetime.now().strftime("%Y-%m")  # Format: "2023-10"
    
    connexion = connect_db()
    curseur = connexion.cursor()
    curseur.execute("SELECT id, solde_congé, dernier_mois_maj FROM utilisateurs")
    employes = curseur.fetchall()
    
    for employe in employes:
        employe_id, solde_congé, dernier_mois_maj = employe
        if dernier_mois_maj != mois_actuel:
            nouveau_solde_conge = solde_congé + 2.5
            curseur.execute("""
                UPDATE utilisateurs
                SET solde_congé = ?, dernier_mois_maj = ?
                WHERE id = ?
            """, (nouveau_solde_conge, mois_actuel, employe_id))
            print(f"Congé mis à jour pour l'utilisateur ID {employe_id}: {nouveau_solde_conge} jours")
        else:
            print(f"Pas de mise à jour pour l'utilisateur ID {employe_id}, mois déjà mis à jour")
    
    connexion.commit()
    connexion.close()
    print("Mise à jour mensuelle des congés terminée.")

