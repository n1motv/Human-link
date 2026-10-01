import pytest
import re
from app import app, connect_db, generer_id, email_existe, generer_mot_de_passe
from flask import session

@pytest.fixture
def client():
    """
    Fixture Pytest qui crée un client de test Flask et configure l'application en mode TESTING.
    """
    app.config['TESTING'] = True
    app.config['WTF_CSRF_ENABLED'] = False  # Désactive CSRF si vous utilisez Flask-WTF
    with app.test_client() as client:
        with app.app_context():
            # Ici, vous pouvez initialiser une base de données de test
            pass
        yield client

# -------------------------------------------------------------------
#                     TESTS DES FONCTIONS HELPERS
# -------------------------------------------------------------------

def test_generer_id():
    """
    Vérifie que l'ID généré correspond au format 0 + 5 chiffres + 1 lettre majuscule (ex: 012345A).
    """
    new_id = generer_id()
    assert len(new_id) == 7
    assert re.match(r"^0\d{5}[A-Z]$", new_id)

def test_generer_mot_de_passe():
    """
    Vérifie que le mot de passe généré respecte la longueur et la présence
    de majuscules, minuscules, chiffres et caractères spéciaux.
    """
    pwd = generer_mot_de_passe(12)
    assert len(pwd) >= 8
    assert any(c.isdigit() for c in pwd)
    assert any(c.islower() for c in pwd)
    assert any(c.isupper() for c in pwd)
    assert any(c in "!@#$%^&*()-_+=" for c in pwd)

def test_email_existe(client):
    """
    Teste la fonction email_existe en insérant un utilisateur puis en vérifiant la détection.
    """
    test_email = "test_email_existe@example.com"

    with app.app_context():
        conn = connect_db()
        cur = conn.cursor()

        # Insère un utilisateur de test
        cur.execute("""INSERT INTO utilisateurs (id, nom, prenom, email)
                       VALUES (?, ?, ?, ?)""", ("012345A", "Test", "Pytest", test_email))
        conn.commit()

        # Vérifie que l'email est reconnu
        assert email_existe(test_email) == True
        # Vérifie qu'un autre email n'existe pas
        assert email_existe("inconnu@example.com") == False

        # Nettoyage
        cur.execute("DELETE FROM utilisateurs WHERE email = ?", (test_email,))
        conn.commit()
        conn.close()

# -------------------------------------------------------------------
#                      TESTS DES ROUTES COMMUNES
# -------------------------------------------------------------------

def test_route_login_get(client):
    """
    Vérifie qu'on peut accéder à la page /login en GET (statut 200).
    """
    response = client.get("/login")
    assert response.status_code == 200
    # Vérifier la présence d'un élément texte dans la page de login
    page_text = response.get_data(as_text=True)
    assert "Connexion" in page_text or "Login" in page_text

def test_route_login_post_bad_credentials(client):
    """
    Teste une tentative de connexion avec de mauvais identifiants.
    On doit recevoir un message d'erreur.
    """
    response = client.post(
        "/login",
        data={"email": "unknown@example.com", "mot_de_passe": "wrongpwd"},
        follow_redirects=True
    )
    page_text = response.get_data(as_text=True)
    # On s'attend à un message d'erreur
    assert "Aucun compte trouvé" in page_text or "Mot de passe incorrect" in page_text

def test_route_logout(client):
    """
    Vérifie que la route /logout redirige bien vers /login.
    """
    response = client.get("/logout", follow_redirects=True)
    page_text = response.get_data(as_text=True)
    assert "Login" in page_text or "Connexion" in page_text

# -------------------------------------------------------------------
#                      TESTS DES ROUTES ADMIN
# -------------------------------------------------------------------

def test_route_admin_dashboard_non_admin(client):
    """
    Vérifie qu'un utilisateur non connecté (ou non admin) est bloqué à l'accès /admin_dashboard.
    """
    response = client.get("/admin_dashboard", follow_redirects=True)
    page_text = response.get_data(as_text=True)
    assert "Vous devez être connecté" in page_text

# -------------------------------------------------------------------
#                      TESTS DES ROUTES EMPLOYÉ
# -------------------------------------------------------------------

def test_route_voir_mes_infos_non_connecte(client):
    """
    Vérifie qu'un utilisateur non connecté ne peut pas accéder à /voir_mes_infos.
    """
    response = client.get("/voir_mes_infos", follow_redirects=True)
    page_text = response.get_data(as_text=True)
    assert "Vous devez être connecté" in page_text

# -------------------------------------------------------------------
#                      AUTRES TESTS POSSIBLES
# -------------------------------------------------------------------
# - Tester la création d'un congé
# - Tester la soumission de feedback
# - Tester le chatbot (POST /chatbot) en envoyant une question
# - etc.
