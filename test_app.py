import os
import pytest
import tempfile
import bcrypt
from datetime import datetime, timedelta
from flask import session
from app import (
    app,
    initialiser_base_de_donnees,
    verifier_toutes_contraintes,
    email_existe,
    allowed_file,
    generer_mot_de_passe,
    envoyer_email,
    compter_jours_de_conge,
    connect_db
)
from werkzeug.datastructures import FileStorage


@pytest.fixture
def client():
    """
    Fixture Pytest : configure l'application Flask en mode TEST,
    créé un client de test et initialise la base.
    """
    # Configuration de l'app pour le test
    app.config['TESTING'] = True
    app.config['WTF_CSRF_ENABLED'] = False
    # Optionnel : utilisation d'une BDD temporaire si nécessaire
    # par exemple : app.config['DATABASE'] = ':memory:' (si votre connect_db() le permet)

    # On peut appeler initialiser_base_de_donnees() si nécessaire.
    with app.test_client() as client:
        with app.app_context():
            initialiser_base_de_donnees()
        yield client


def test_index_redirection(client):
    """
    Test : la route "/" doit renvoyer vers /login via la page loading.html.
    """
    response = client.get("/")
    assert response.status_code == 200
    # Vérifie qu'on voit un template 'loading.html' ou un contenu spécifique
    assert b"redirect_url" in response.data


def test_login_success(client):
    """
    Test : connexion avec un compte existant (admin) si vous avez
    déjà un compte admin créé par cree_compte_admin().
    """
    # Par défaut, cree_compte_admin() crée un admin avec l'email configuré 
    # (app.config['MAIL_USERNAME']) et un mot de passe "admin" haché 
    # (à adapter si besoin)
    # Vous pouvez ajuster ici si la config est différente.
    
    # Supposez que l'admin_email correspond à app.config['MAIL_USERNAME']
    admin_email = app.config['MAIL_USERNAME']
    
    # On ne connaît pas le mot de passe en clair, car c'est hashed. 
    # Dans vos tests, vous pouvez insérer manuellement un utilisateur de test 
    # si besoin. A titre d'exemple, testons une route:
    
    response = client.post("/login", data={
        "email": admin_email,
        "mot_de_passe": "admin"  # Supposons que le mot de passe admin en clair est "admin"
    }, follow_redirects=True)

    # Vérifie si on est redirigé vers le dashboard admin
    # ou qu'on trouve "admin_dashboard" dans la réponse 
    # (selon comment vous gérez la redirection)
    assert response.status_code == 200
    # On peut vérifier un bout de HTML dans la page de redirection
    # par exemple : b"Tableau de bord Admin"
    # Mais ici on ne sait pas précisément le template.
    # On se contente de vérifier qu'on n'a pas d'erreur.
    # S'il y a un message de type "Identifiants incorrects", c'est un échec.
    assert b"Identifiants incorrects" not in response.data


def test_login_failure(client):
    """
    Test : tentative de connexion avec des identifiants invalides.
    """
    response = client.post("/login", data={
        "email": "invalide@example.com",
        "mot_de_passe": "wrongpassword"
    }, follow_redirects=True)

    assert response.status_code == 200
    # On s'attend à voir "Identifiants incorrects" (flash) ou un comportement similaire
    assert b"Identifiants incorrects" in response.data


def test_logout(client):
    """
    Test : vérifie la déconnexion.
    """
    # On se connecte d'abord
    admin_email = app.config['MAIL_USERNAME']
    client.post("/login", data={
        "email": admin_email,
        "mot_de_passe": "admin"
    }, follow_redirects=True)

    # Maintenant, on fait un /logout
    response = client.get("/logout", follow_redirects=True)
    assert response.status_code == 200
    # On peut vérifier que la session est vidée ou que "login" 
    # est dans la page résultat
    assert b"login" in response.data


def test_email_existe(client):
    """
    Test la fonction email_existe() : doit renvoyer True si email existe.
    """
    admin_email = app.config['MAIL_USERNAME']
    assert email_existe(admin_email) is True
    assert email_existe("random@email.com") is False


def test_allowed_file():
    """
    Test la fonction allowed_file() pour vérifier les extensions autorisées.
    """
    assert allowed_file("test.png") is True
    assert allowed_file("document.pdf") is True
    assert allowed_file("image.jpg") is True
    assert allowed_file("image.JPG") is True  # c'est en lower() donc OK
    assert allowed_file("fichier.exe") is False
    assert allowed_file("fichier.txt") is False


def test_generer_mot_de_passe():
    """
    Test la fonction generer_mot_de_passe() pour s'assurer 
    qu'elle respecte la longueur et la complexité.
    """
    mdp = generer_mot_de_passe(12)
    assert len(mdp) >= 8
    assert any(c.isdigit() for c in mdp)
    assert any(c.isupper() for c in mdp)
    assert any(c.islower() for c in mdp)
    speciaux = "!@#$%^&*()-_+="
    assert any(c in speciaux for c in mdp)


def test_compter_jours_de_conge():
    """
    Test la fonction compter_jours_de_conge() pour un range 
    incluant des week-ends.
    """
    debut = datetime(2023, 10, 2)   # Lundi
    fin = datetime(2023, 10, 6)     # Vendredi
    # Du 2 au 6 octobre 2023 : 5 jours ouvrés
    assert compter_jours_de_conge(debut, fin) == 5

    # Si on inclut un samedi (7 octobre) => ne compte pas
    fin_samedi = datetime(2023, 10, 7)
    assert compter_jours_de_conge(debut, fin_samedi) == 5

    # Test sur un seul jour
    meme_jour = datetime(2023, 10, 4)
    assert compter_jours_de_conge(meme_jour, meme_jour) == 1


def test_verifier_toutes_contraintes_conge_pas_de_chevauchement(client):
    """
    Vérifie qu'en l'absence de chevauchement, 
    la fonction renvoie None (pas d'erreur).
    On doit d'abord insérer un employé test pour vérifier.
    """
    # Insertion d'un employé fictif
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        INSERT INTO utilisateurs (id, nom, prenom, email, mot_de_passe, solde_congé)
        VALUES ('TEST01A', 'Test', 'User', 'test_user@example.com', 'xxx', 10.0)
    """)
    connexion.commit()
    connexion.close()

    date_debut = datetime(2025, 1, 1).date()
    date_fin = datetime(2025, 1, 5).date()

    # Appel
    erreur = verifier_toutes_contraintes("TEST01A", date_debut, date_fin, "congé")
    # Devrait être None car aucun congé n'existe
    assert erreur is None


def test_verifier_toutes_contraintes_conge_avec_chevauchement(client):
    """
    Vérifie que si un congé est déjà posé, 
    un second congé chevauchant provoque un message d'erreur.
    """
    # On insère un congé dans demandes_congé
    connexion = connect_db()
    cur = connexion.cursor()
    # date_debut: 2025-01-10, date_fin: 2025-01-15
    cur.execute("""
        INSERT INTO demandes_congé 
        (id_utilisateurs, raison, date_debut, date_fin, statut, statut_manager, statut_admin)
        VALUES ('TEST01A', 'Vacances', '2025-01-10', '2025-01-15', 'accepte', 'accepte', 'accepte')
    """)
    connexion.commit()
    connexion.close()

    # Nouveau congé qui chevauche, par exemple 2025-01-14 => 2025-01-18
    debut = datetime(2025, 1, 14).date()
    fin = datetime(2025, 1, 18).date()

    erreur = verifier_toutes_contraintes("TEST01A", debut, fin, "congé")
    assert erreur is not None
    assert "chevauche un autre congé" in erreur


def test_envoyer_email(capfd):
    """
    Test basique de la fonction envoyer_email() :
    On ne va pas réellement envoyer l'email, mais on s'assure 
    que la fonction se termine correctement et qu'on a le print
    "Email envoyé à ...".
    """
    envoyer_email(
        sujet="Test",
        destinataire="fake@example.com",
        contenu="Contenu test"
    )
    out, _ = capfd.readouterr()
    assert "Email envoyé à fake@example.com" in out


def test_reset_password_page(client):
    """
    Vérifie que la page /reset_password est accessible.
    """
    response = client.get("/reset_password")
    assert response.status_code == 300
    # On peut vérifier un bout de HTML
    assert f"Réinitialiser votre mot de passe" in response.data or f"récupération_mot_de_passe" in response.data


def test_logout_without_login(client):
    """
    Si on tente de faire logout sans être logué, on doit retomber sur la page de login
    """
    response = client.get("/logout", follow_redirects=True)
    assert response.status_code == 200
    # Devrait contenir la page de login
    assert b"login" in response.data
