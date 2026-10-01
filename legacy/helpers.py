# ┌────────────────────────────────────────────────────┐
# │    OYEZ, OYEZ ! BIENVENUE DANS NOTRE SCRIPT MAGIQUE  │
# └────────────────────────────────────────────────────┘

# On charge tout le beau monde nécessaire.
import os
import random
import re
import string
import sqlite3
import unicodedata
from hashlib import md5
from datetime import datetime, timedelta
from dateutil import parser as date_parser
from nltk.tokenize import word_tokenize
import nltk
import logging
import requests
from langdetect import detect
from argon2 import PasswordHasher
from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv
from flask import Flask
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_mail import Mail, Message
from logging.handlers import TimedRotatingFileHandler
from itsdangerous import URLSafeTimedSerializer

# Petit coucou à notre module maison qui connecte la DB.
from db_setup import connect_db

# Ici on lance la boule de cristal Flask.
ph = PasswordHasher()
load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY')
app.config['SESSION_PERMANENT'] = False
app.config['TEMPLATES_AUTO_RELOAD'] = True
app.config['DEBUG'] = True

# On va loguer nos petites bêtises dans un dossier.
LOG_DIR = "logs"
os.makedirs(LOG_DIR, exist_ok=True)

# Un brin de config pour l'envoi d'emails, histoire de spammer tranquillement.
app.config['MAIL_SERVER'] = 'smtp.gmail.com'
app.config['MAIL_PORT'] = 587
app.config['MAIL_USE_TLS'] = True
app.config['MAIL_USERNAME'] = os.getenv('MAIL_USERNAME')
app.config['MAIL_PASSWORD'] = os.getenv('MAIL_PASSWORD')
app.config['LLM_API_URL'] = os.getenv('LLM_API_URL')
app.config['MODEL_NAME'] = os.getenv('MODEL_NAME')

api_url = app.config['LLM_API_URL']
model_name = app.config['MODEL_NAME']
admin_email = app.config['MAIL_USERNAME']

# On évite d'être inondé de requêtes par des cliqueurs fous.
limiter = Limiter(
    key_func=get_remote_address,
    app=app,
    default_limits=["10 per minute"]
)

# Autorisons-nous quelques formats de fichiers.
ALLOWED_EXTENSIONS = {'pdf', 'png', 'jpg', 'jpeg', 'gif'}
BASE_COFFRE_FORT = "static/coffre_fort/"
ALLOWED_EXTENSIONS_DOCUMENTS = {'pdf'}

# Et hop, un objet Mail.
mail = Mail(app)


# ┌────────────────────────────────────────────────────┐
# │   FONCTIONS UTILES POUR FAIRE TOUT LE TRALALA   │
# └────────────────────────────────────────────────────┘

def ajouter_conge_mensuel():
    """Augmente le solde de congé des utilisateurs chaque mois."""
    mois_actuel = datetime.now().strftime("%Y-%m")
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
            print(f"Pas de mise à jour pour l'utilisateur ID {employe_id}, mois déjà appliqué.")
    connexion.commit()
    connexion.close()
    print("Mise à jour mensuelle des congés terminée.")


def creation_upload_dossier(nom):
    """Crée un dossier pour uploader des fichiers, qu'on nomme selon nos humeurs."""
    BASE_UPLOAD_FOLDER = 'static/uploads/'
    full_path = os.path.join(BASE_UPLOAD_FOLDER, nom)
    app.config['UPLOAD_FOLDER'] = full_path
    app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024
    if not os.path.exists(app.config['UPLOAD_FOLDER']):
        os.makedirs(app.config['UPLOAD_FOLDER'])
    return full_path

def allowed_file(filename):
    """Check si c'est un fichier image ou PDF."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def allowed_file_document(filename):
    """Check si c'est du PDF only."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS_DOCUMENTS

def log_activities():
    """Pose quelques logs rigolos dans un fichier pour la postérité."""
    LOG_DIR = "logs"
    os.makedirs(LOG_DIR, exist_ok=True)

    log_filename = os.path.join(LOG_DIR, f"security-{datetime.now().strftime('%Y-%m-%d')}.log")

    log_handler = TimedRotatingFileHandler(
        log_filename, when="midnight", interval=1, backupCount=7, encoding="utf-8"
    )
    log_handler.suffix = "%Y-%m-%d"
    log_handler.extMatch = r"^\d{4}-\d{2}-\d{2}$"

    formatter = logging.Formatter("%(asctime)s - %(levelname)s - %(message)s")
    log_handler.setFormatter(formatter)

    logging.basicConfig(
        level=logging.WARNING,
        handlers=[log_handler]
    )

    logging.warning("⚠️ Ceci est un avertissement vital !")
    logging.error("❌ OUPS, une erreur cataclysmique !")

def tentative_acces_suspect(email):
    """Pour gueuler dans nos logs qu'un vilain spamme le mot de passe."""
    logging.warning(f"Tentative suspecte sur le compte: {email}")

def generer_id():
    """Génère un matricule top-secret, de style '0xxxxxL'."""
    numeros = ''.join(random.choices(string.digits, k=5))
    lettre = random.choice(string.ascii_uppercase)
    return f"0{numeros}{lettre}"

def id_existe(id_employe):
    """Check si l'ID est déjà pris."""
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("SELECT 1 FROM utilisateurs WHERE id = ?", (id_employe,))
    return cur.fetchone() is not None

def email_existe(email):
    """Check si l'email existe déjà. On veut pas de doublons !"""
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("SELECT 1 FROM utilisateurs WHERE email = ?", (email,))
    existe = cur.fetchone() is not None
    connexion.close()
    return existe

def generer_mot_de_passe(longueur=12):
    """Génération d'un mot de passe badass."""
    if longueur < 8:
        raise ValueError("Le mot de passe doit avoir au moins 8 caractères.")

    caracteres = string.ascii_letters + string.digits + "!@#$%^&*()-_+="
    mot_de_passe = ''.join(random.choices(caracteres, k=longueur))

    if not any(c.isdigit() for c in mot_de_passe):
        mot_de_passe += random.choice(string.digits)
    if not any(c.islower() for c in mot_de_passe):
        mot_de_passe += random.choice(string.ascii_lowercase)
    if not any(c.isupper() for c in mot_de_passe):
        mot_de_passe += random.choice(string.ascii_uppercase)
    if not any(c in "!@#$%^&*()-_+=" for c in mot_de_passe):
        mot_de_passe += random.choice("!@#$%^&*()-_+=")

    return ''.join(random.sample(mot_de_passe, len(mot_de_passe)))

def envoyer_email(sujet, destinataire, contenu):
    """Petit vol d'email, on balance le message à la boîte cible."""
    message = Message(
        subject=sujet,
        body=contenu,
        sender=app.config['MAIL_USERNAME'],
        recipients=[destinataire]
    )
    mail.send(message)
    print(f"Email envoyé à {destinataire}")

def normalize_filename(filename):
    """Vire les accents et autres trucs pour pas péter S3."""
    filename = ''.join(
        c for c in unicodedata.normalize('NFD', filename) if unicodedata.category(c) != 'Mn'
    )
    filename = re.sub(r'\s+', '-', filename)
    filename = re.sub(r'[^a-zA-Z0-9_.-]', '', filename)
    return filename

serializer = URLSafeTimedSerializer(app.secret_key)

def creer_notification(email, message, type_notification):
    """On enfourne une notif pour l'user, en limitant à 5 max."""
    try:
        connexion = connect_db()
        cur = connexion.cursor()

        cur.execute("SELECT 1 FROM utilisateurs WHERE email = ?", (email,))
        if not cur.fetchone():
            print(f"Utilisateur inconnu : {email}")
            return False

        date_creation = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        cur.execute("""
            INSERT INTO notifications (email, message, type, created_at, is_read)
            VALUES (?, ?, ?, ?, 0)
        """, (email, message, type_notification, date_creation))

        cur.execute("""
            DELETE FROM notifications
            WHERE email = ?
            AND id NOT IN (
                SELECT id FROM notifications
                WHERE email = ?
                ORDER BY created_at DESC
                LIMIT 5
            )
        """, (email, email))

        connexion.commit()
        print(f"Notification créée pour {email}.")
        return True

    except sqlite3.Error as e:
        print(f"Erreur dans notif : {e}")
        return False

    finally:
        if 'connexion' in locals():
            connexion.close()

def récupérer_notifications(email):
    """Choppe les notifs de l'user."""
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        SELECT id, message, type, created_at, is_read
        FROM notifications
        WHERE email = ?
        ORDER BY created_at DESC
    """, (email,))
    notifications = cur.fetchall()
    connexion.close()

    return [
        {
            'id': n[0],
            'message': n[1],
            'type': n[2],
            'created_at': datetime.strptime(n[3], '%Y-%m-%d %H:%M:%S') if isinstance(n[3], str) else n[3],
            'is_read': n[4]
        }
        for n in notifications
    ]

def récupérer_nombre_notifications_non_lues(email):
    """Compte les notifs non-lues."""
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("""
        SELECT COUNT(*)
        FROM notifications
        WHERE email = ? AND is_read = 0
    """, (email,))
    count = cur.fetchone()[0]
    connexion.close()
    return count

def marquer_notifications_comme_lues(email):
    """Hop, on met tout en 'déjà lu'."""
    connexion = connect_db()
    try:
        cur = connexion.cursor()
        cur.execute("""
            UPDATE notifications
            SET is_read = 1
            WHERE email = ?
        """, (email,))
        connexion.commit()
    except sqlite3.OperationalError as e:
        print(f"Erreur SQLite: {e}")
    finally:
        connexion.close()

def compter_jours_de_conge(date_debut, date_fin):
    """On additionne les jours ouvrables, on skippe le weekend."""
    jours_conge = 0
    date_courante = date_debut
    while date_courante <= date_fin:
        if date_courante.weekday() < 5:
            jours_conge += 1
        date_courante += timedelta(days=1)
    return jours_conge

def generer_couleur_employe(email):
    """Une jolie couleur pastel basée sur un hash de l'email."""
    hash_email = md5(email.encode()).hexdigest()
    hue = int(hash_email[:8], 16) % 360
    return f'hsl({hue}, 30%, 50%)'

def verifier_toutes_contraintes(id_employe, date_debut, date_fin, type_demande):
    """Pas de chevauchements : si vous avez déjà un congé, impossible d'y coller un arrêt, etc."""
    connexion = connect_db()
    cur = connexion.cursor()

    if type_demande == "congé":
        cur.execute("""
            SELECT id FROM demandes_congé
            WHERE id_utilisateurs = ? AND (
                (? BETWEEN date_debut AND date_fin) OR
                (? BETWEEN date_debut AND date_fin) OR
                (date_debut BETWEEN ? AND ?) OR
                (date_fin BETWEEN ? AND ?)
            )
        """, (id_employe, date_debut, date_fin, date_debut, date_fin, date_debut, date_fin))
        if cur.fetchone():
            connexion.close()
            return "Vous ne pouvez pas soumettre un congé qui chevauche un autre congé."

        cur.execute("""SELECT email FROM utilisateurs WHERE id = ?""", (id_employe,))
        email_employe = cur.fetchone()[0]

        cur.execute("""
            SELECT id FROM demandes_arrêt
            WHERE employe_email = ? AND (
                (? BETWEEN date_debut AND date_fin) OR
                (? BETWEEN date_debut AND date_fin) OR
                (date_debut BETWEEN ? AND ?) OR
                (date_fin BETWEEN ? AND ?)
            )
        """, (email_employe, date_debut, date_fin, date_debut, date_fin, date_debut, date_fin))
        if cur.fetchone():
            connexion.close()
            return "Vous ne pouvez pas soumettre un congé qui chevauche un arrêt maladie."

    elif type_demande == "arrêt":
        cur.execute("""
            SELECT id FROM demandes_arrêt
            WHERE employe_email = ? AND (
                (? BETWEEN date_debut AND date_fin) OR
                (? BETWEEN date_debut AND date_fin) OR
                (date_debut BETWEEN ? AND ?) OR
                (date_fin BETWEEN ? AND ?)
            )
        """, (id_employe, date_debut, date_fin, date_debut, date_fin, date_debut, date_fin))
        if cur.fetchone():
            connexion.close()
            return "Vous ne pouvez pas soumettre un arrêt maladie qui chevauche un autre arrêt maladie."

        cur.execute("""SELECT id FROM utilisateurs WHERE email = ?""", (id_employe,))
        real_id = cur.fetchone()[0]

        cur.execute("""
            SELECT id FROM demandes_congé
            WHERE id_utilisateurs = ? AND (
                (? BETWEEN date_debut AND date_fin) OR
                (? BETWEEN date_debut AND date_fin) OR
                (date_debut BETWEEN ? AND ?) OR
                (date_fin BETWEEN ? AND ?)
            )
        """, (real_id, date_debut, date_fin, date_debut, date_fin, date_debut, date_fin))
        if cur.fetchone():
            connexion.close()
            return "Vous ne pouvez pas soumettre un arrêt maladie qui chevauche un congé."

    elif type_demande == "teletravail":
        cur.execute("""
            SELECT id FROM demandes_congé
            WHERE id_utilisateurs = ? AND statut = 'accepte' AND (
                (? BETWEEN date_debut AND date_fin) OR
                (? BETWEEN date_debut AND date_fin) OR
                (date_debut BETWEEN ? AND ?) OR
                (date_fin BETWEEN ? AND ?)
            )
        """, (id_employe, date_debut, date_fin, date_debut, date_fin, date_debut, date_fin))
        if cur.fetchone():
            connexion.close()
            return "Vous ne pouvez pas soumettre un jour de télétravail qui chevauche un congé."

        cur.execute("""SELECT email FROM utilisateurs WHERE id = ?""", (id_employe,))
        email_employe = cur.fetchone()[0]
        cur.execute("""
            SELECT id FROM demandes_arrêt
            WHERE employe_email = ? AND statut = 'accepte' AND (
                (? BETWEEN date_debut AND date_fin) OR
                (? BETWEEN date_debut AND date_fin) OR
                (date_debut BETWEEN ? AND ?) OR
                (date_fin BETWEEN ? AND ?)
            )
        """, (email_employe, date_debut, date_fin, date_debut, date_fin, date_debut, date_fin))
        if cur.fetchone():
            connexion.close()
            return "Vous ne pouvez pas soumettre un jour de télétravail qui chevauche un arrêt maladie."

    connexion.close()
    return None

def modifier_mot_de_passe(email, nouveau_mot_de_passe):
    """On met à jour le mot de passe d'un utilisateur, en checkant la complexité."""
    if len(nouveau_mot_de_passe) < 8 or \
       not re.search(r'[A-Z]', nouveau_mot_de_passe) or \
       not re.search(r'[0-9]', nouveau_mot_de_passe) or \
       not re.search(r'[!@#$%^&*(),.?":{}|<>]', nouveau_mot_de_passe):
        return "Le mot de passe doit contenir au moins 8 caractères, une majuscule, un chiffre et un caractère spécial."

    mot_de_passe_hache = ph.hash(nouveau_mot_de_passe)
    connexion = connect_db()
    cur = connexion.cursor()

    try:
        cur.execute("SELECT id FROM utilisateurs WHERE email = ?", (email,))
        employe = cur.fetchone()
        if not employe:
            return "L'adresse e-mail fournie n'existe pas dans la base de données."

        cur.execute("""
            UPDATE utilisateurs
            SET mot_de_passe = ?
            WHERE email = ?
        """, (mot_de_passe_hache, email))
        connexion.commit()
        return "Le mot de passe a été mis à jour avec succès."

    except Exception as e:
        connexion.rollback()
        return f"Une erreur est survenue : {str(e)}"

    finally:
        connexion.close()



def translate_to_french(text: str) -> str:
    """
    Détecte la langue du texte et si ce n'est pas le français,
    utilise l'API MyMemory pour le traduire en français.
    
    Ajoute une heuristique : si le texte contient certains mots typiques
    d'une langue (espagnol ou italien), force la détection sur celle-ci.
    """
    try:
        detected_lang = detect(text)
        # Correction heuristique si le texte est court ou contient des indices spécifiques
        lower_text = text.lower()
        # Pour l'espagnol
        if detected_lang == 'fr' and any(keyword in lower_text for keyword in ['teléfono', 'hola', 'gracias']):
            detected_lang = 'es'
        # Pour l'italien
        if detected_lang == 'fr' and any(keyword in lower_text for keyword in ['ciao', 'grazie', 'buongiorno']):
            detected_lang = 'it'
            
        # Si la langue détectée n'est pas le français, on traduit
        if detected_lang != 'fr':
            params = {
                "q": text,
                "langpair": f"{detected_lang}|fr"
            }
            response = requests.get("https://api.mymemory.translated.net/get", params=params, timeout=10)
            data = response.json()
            translated = data.get("responseData", {}).get("translatedText")
            if translated:
                return translated
    except Exception as e:
        print(f"Erreur lors de la traduction : {e}")
    return text


def infer_llm(question: str, user_context: dict, email_utilisateur: str = None) -> str:
    """On interroge un LLM, s'il plante on fait un fallback artisanal."""
    question=translate_to_french(question)
    temperature = 0.3
    prompt = f"""
Tu es un assistant RH qui répond aux questions des employés en se basant uniquement sur les informations suivantes.
Si l'information demandée ne figure pas ci-dessous, réponds : "Désolé, je n'ai pas accès à ces informations."
Réponds de manière claire, directe et concise, sans aucune formule introductive ni conclusion.
Utilise uniquement les informations présentées dans les sections ci-dessous pour répondre.

========================================================================
[Exemples de questions et réponses]

Exemple 1:
Question : "Est-ce que j'ai déposé des congés ?"
Réponse : "Vous avez déposé un congé du 2025-02-06 au 2025-02-06 pour l'événement religieux (Participation à une cérémonie). Vous avez également un congé du 2025-02-11 au 2025-02-13 pour un voyage familial, en attente."

Exemple 2:
Question : "Quel est mon matricule ?"
Réponse : "084498V."

Exemple 3:
Question : "Ai-je des arrêts maladie en cours ?"
Réponse : "Vous avez un arrêt maladie du 2025-04-01 au 2025-04-03 (justifié), accepté."

Exemple 4:
Question : "Quel est mon salaire ?"
Réponse : "3000€ brut mensuel."

Exemple 5:
Question : "Combien de jours de télétravail ai-je la semaine prochaine ?"
Réponse : "2 jours, le 2025-02-20 et le 2025-02-22."

Exemple 6:
Question : "Est-ce que j'ai une prime en attente ?"
Réponse : "500€ de prime exceptionnelle, en attente de validation."

Exemple 7:
Question : "Quelles sont mes notifications non lues ?"
Réponse : "1 notification : 'Réunion à 14h'."

Exemple 8:
Question : "Quel est mon numéro de sécurité sociale ?"
Réponse : "123-45-6789."

Exemple 9:
Question : "Quel est mon nom ?"
Réponse : "Satochi Nakamoto"

Exemple 10:
Question : "Je m'appelle comment ?"
Réponse : "Satochi Nakamoto"
========================================================================
[Informations de l'utilisateur]

--- INFORMATIONS UTILISATEUR ---
{user_context.get('info_utilisateur', 'Aucune info')}

--- DEMANDES DE CONGÉ ---
{user_context.get('info_conges', 'Aucun congé')}

--- ARRÊTS MALADIE ---
{user_context.get('info_arrets', 'Aucun arrêt')}

--- TÉLÉTRAVAIL ---
{user_context.get('info_teletravail', 'Aucun télétravail')}

--- PRIMES ---
{user_context.get('info_primes', 'Aucune prime')}

--- NOTIFICATIONS ---
{user_context.get('info_notifications', 'Aucune notification')}

--- AUTRES ---
{user_context.get('info_autres', 'Aucune info supplémentaire')}

========================================================================
Voici la question de l'utilisateur :
{question}

Réponds uniquement par la réponse directe à la question, sans aucune explication ou préambule.
"""

    payload = {
        "model": model_name,
        "prompt": prompt,
        "max_tokens": 512,
        "temperature": temperature
    }
    try:
        response = requests.post(api_url, json=payload, timeout=30)
        response.raise_for_status()
        data = response.json()

        if "choices" in data and len(data["choices"]) > 0:
            generated_text = data["choices"][0].get("text", "")
            if generated_text.strip():
                return generated_text.strip()
    except Exception as e:
        print(f"LM Studio n'est pas accessible : {e}")
    return fallback_response(question, user_context, email_utilisateur=email_utilisateur)

try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt')

import re
def match_word(word, text):
    pattern = rf"\b{re.escape(word)}\b"
    return re.search(pattern, text) is not None

def fallback_response(question: str, user_context: dict, email_utilisateur: str = None) -> str:
    """
    Plan B si le LLM n'est pas dispo, on tente de bricoler nous-mêmes une réponse
    en analysant l'intention avec NLTK et un simple jeu de mots-clés/synonymes en français.
    """

    question_lower = question.lower()
    tokens = word_tokenize(question_lower)


    intent_keywords = {
        "matricule": [
            "matricule", "id", "identifiant", "numéro d'identification"
        ],
        "name": [
            "nom", "prénom", "m'appelle", "comment je m'appelle", "quel est mon nom"
        ],
        "age": [
            "âge", "age", "vie", "années", "quel âge", "quel age"
        ],
        "birthdate": [
            "naissance", "date de naissance", "anniversaire"
        ],
        "poste": [
            "poste", "fonction", "rôle", "job", "position"
        ],
        "departement": [
            "département", "departement", "service", "pôle", "pole"
        ],
        "salaire": [
            "salaire", "paie", "rémunération", "brut", "net"
        ],
        "social_security": [
            "sécurité sociale", "numero sécurité", "numéro sécu", "numéro secu", "nss"
        ],
        "telephone": [
            "téléphone", "telephone", "portable", "mobile", "tel"
        ],
        "adresse": [
            "adresse", "domicile", "habitation", "rue", "logement"
        ],
        "date_embauche": [
            "embauche", "recrutement", "arrivée", "commencé", "commencé le"
        ],
        "type_contrat": [
            "contrat", "type de contrat", "cdi", "cdd", "freelance", "stage", "alternance"
        ],
        "conge": [
            "congé", "conges", "vacances", "repos", "demande de congé", "demande de congés","congés"
        ],
        "arret": [
            "arrêt", "arret", "maladie", "arrêt maladie", "arret maladie", "arrêt de travail", "arret de travail"
        ],
        "teletravail": [
            "télétravail", "teletravail", "travail à distance", "remote"
        ],
        "prime": [
            "prime", "bonus", "gratification"
        ],
        "notification": [
            "notification", "notif", "alertes", "non lues", "messages non lus"
        ],
        "manager": [
            "manager", "supérieur", "chef", "responsable", "boss"
        ]
    }

    detected_intents = []
    
    for intent, keywords in intent_keywords.items():
        # Si un des mots-clés de 'keywords' est dans la question, on retient l'intent
        if any(match_word(kw, question_lower) for kw in keywords):
            detected_intents.append(intent)

    priority_list = [
        "matricule", "name", "age", "birthdate", "poste", "departement", "salaire",
        "social_security", "telephone", "adresse", "date_embauche", "type_contrat",
        "conge", "arret", "teletravail", "prime", "notification", "manager"
    ]
    selected_intent = None
    for intent in priority_list:
        if intent in detected_intents:
            selected_intent = intent
            break

    connexion = None
    curseur = None
    utilisateur_db = None
    if email_utilisateur:
        connexion = connect_db()
        curseur = connexion.cursor()
        curseur.execute("SELECT * FROM utilisateurs WHERE email = ?", (email_utilisateur,))
        utilisateur_db = curseur.fetchone()

    def close_conn():
        if connexion:
            connexion.close()

    def calcule_age(date_str: str) -> str:
        try:
            dob = datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            # Si le format est incertain, on peut tenter dateutil
            from dateutil import parser as date_parser
            try:
                dob = date_parser.parse(date_str).date()
            except Exception:
                return None
        today = datetime.today().date()
        age = today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        return f"{age} ans."


    import re

    if selected_intent == "matricule":
        if utilisateur_db:
            close_conn()
            return utilisateur_db["id"]  # Ex: "084498V"
        else:
            info = user_context.get("info_utilisateur", "")
            match = re.search(r"id\s*:\s*(\S+)", info, re.IGNORECASE)
            if match:
                close_conn()
                return match.group(1)
        close_conn()
        return "Désolé, je n'ai pas accès à ces informations."

    elif selected_intent == "name":
        # Nom / prénom
        if utilisateur_db:
            nom = (utilisateur_db["nom"] or "").strip()
            prenom = (utilisateur_db["prenom"] or "").strip()
            close_conn()
            if nom and prenom:
                return f"{prenom} {nom}"
            elif nom:
                return nom
            return "Désolé, je n'ai pas accès à ces informations."
        else:
            info = user_context.get("info_utilisateur", "")
            nom_match = re.search(r"nom\s*:\s*(.+)", info, re.IGNORECASE)
            prenom_match = re.search(r"pr[ée]nom\s*:\s*(.+)", info, re.IGNORECASE)
            if nom_match or prenom_match:
                nm = nom_match.group(1).strip() if nom_match else ""
                pm = prenom_match.group(1).strip() if prenom_match else ""
                close_conn()
                return (pm + " " + nm).strip()
        close_conn()
        return "Désolé, je n'ai pas accès à ces informations."

    elif selected_intent in ["age", "birthdate"]:
        # Date de naissance => calcul d'âge
        if utilisateur_db and utilisateur_db["date_naissance"]:
            a = calcule_age(utilisateur_db["date_naissance"])
            close_conn()
            return a if a else "Désolé, je n'ai pas accès à ces informations."
        else:
            info = user_context.get("info_utilisateur", "")
            dob_match = re.search(r"date\s+de\s+naissance\s*:\s*(\S+)", info, re.IGNORECASE)
            if dob_match:
                a = calcule_age(dob_match.group(1))
                close_conn()
                return a if a else "Désolé, je n'ai pas accès à ces informations."
        close_conn()
        return "Désolé, je n'ai pas accès à ces informations."

    elif selected_intent == "poste":
        if utilisateur_db and utilisateur_db["poste"]:
            close_conn()
            return utilisateur_db["poste"].strip()
        else:
            info = user_context.get("info_utilisateur", "")
            pos_match = re.search(r"poste\s*:\s*(.+)", info, re.IGNORECASE)
            if pos_match:
                close_conn()
                return pos_match.group(1).strip()
        close_conn()
        return "Désolé, je n'ai pas accès à ces informations."

    elif selected_intent == "departement":
        if utilisateur_db and utilisateur_db["departement"]:
            close_conn()
            return utilisateur_db["departement"].strip()
        else:
            info = user_context.get("info_utilisateur", "")
            dep_match = re.search(r"departement\s*:\s*(.+)", info, re.IGNORECASE)
            if dep_match:
                close_conn()
                return dep_match.group(1).strip()
        close_conn()
        return "Désolé, je n'ai pas accès à ces informations."

    elif selected_intent == "salaire":
        if utilisateur_db and utilisateur_db["salaire"] is not None:
            close_conn()
            return f"{utilisateur_db['salaire']}€ brut mensuel."
        else:
            info = user_context.get("info_utilisateur", "")
            sal_match = re.search(r"salaire\s*:\s*(.+)", info, re.IGNORECASE)
            if sal_match:
                close_conn()
                return sal_match.group(1).strip()
        close_conn()
        return "Désolé, je n'ai pas accès à ces informations."

    elif selected_intent == "social_security":
        # Numéro de sécu
        if utilisateur_db and utilisateur_db["numero_securite_sociale"]:
            close_conn()
            return utilisateur_db["numero_securite_sociale"].strip()
        else:
            info = user_context.get("info_utilisateur", "")
            secu_match = re.search(r"sécurité sociale\s*:\s*(.+)", info, re.IGNORECASE)
            if secu_match:
                close_conn()
                return secu_match.group(1).strip()
        close_conn()
        return "Désolé, je n'ai pas accès à ces informations."

    elif selected_intent == "telephone":
        if utilisateur_db and utilisateur_db["telephone"]:
            close_conn()
            return utilisateur_db["telephone"].strip()
        else:
            info = user_context.get("info_utilisateur", "")
            tel_match = re.search(r"telephone\s*:\s*(.+)", info, re.IGNORECASE)
            if tel_match:
                close_conn()
                return tel_match.group(1).strip()
        close_conn()
        return "Désolé, je n'ai pas accès à ces informations."

    elif selected_intent == "adresse":
        if utilisateur_db and utilisateur_db["adresse"]:
            close_conn()
            return utilisateur_db["adresse"].strip()
        else:
            info = user_context.get("info_utilisateur", "")
            ad_match = re.search(r"adresse\s*:\s*(.+)", info, re.IGNORECASE)
            if ad_match:
                close_conn()
                return ad_match.group(1).strip()
        close_conn()
        return "Désolé, je n'ai pas accès à ces informations."

    elif selected_intent == "date_embauche":
        if utilisateur_db and utilisateur_db["date_embauche"]:
            close_conn()
            return str(utilisateur_db["date_embauche"])
        else:
            info = user_context.get("info_utilisateur", "")
            emb_match = re.search(r"date\s+d['e]mbauche\s*:\s*(\S+)", info, re.IGNORECASE)
            if emb_match:
                close_conn()
                return emb_match.group(1)
        close_conn()
        return "Désolé, je n'ai pas accès à ces informations."

    elif selected_intent == "type_contrat":
        if utilisateur_db and utilisateur_db["type_contrat"]:
            close_conn()
            return utilisateur_db["type_contrat"].strip()
        else:
            info = user_context.get("info_utilisateur", "")
            tc_match = re.search(r"type\s+de\s+contrat\s*:\s*(.+)", info, re.IGNORECASE)
            if tc_match:
                close_conn()
                return tc_match.group(1).strip()
        close_conn()
        return "Désolé, je n'ai pas accès à ces informations."

    elif selected_intent == "conge":
        # Vérifier si la question contient "combien" => nb de demandes
        # ou "solde" => solde de congés
        if utilisateur_db:
            user_id = utilisateur_db["id"]

            if "combien" in tokens:
                curseur.execute("SELECT COUNT(*) as cpt FROM demandes_congé WHERE id_utilisateurs = ?", (user_id,))
                row = curseur.fetchone()
                count = row["cpt"] if row else 0
                close_conn()
                return f"{count} demande(s) de congé."

            elif "solde" in tokens:
                # Ex: "Quel est mon solde de congés ?"
                curseur.execute("SELECT solde_congé FROM utilisateurs WHERE id = ?", (user_id,))
                row = curseur.fetchone()
                if row:
                    solde = row["solde_congé"]
                    close_conn()
                    return f"{solde} jours restants."
                close_conn()
                return "Désolé, je n'ai pas accès à votre solde de congés."

            else:
                # Sinon, on liste les congés
                curseur.execute("""
                    SELECT date_debut, date_fin, statut, raison
                    FROM demandes_congé
                    WHERE id_utilisateurs = ?
                    ORDER BY id DESC
                """, (user_id,))
                rows = curseur.fetchall()
                if rows:
                    rep = []
                    for r in rows:
                        dd = r["date_debut"]
                        df = r["date_fin"]
                        st = r["statut"]
                        rs = r["raison"] or "Sans raison"
                        rep.append(f"Du {dd} au {df} ({st}), {rs}")
                    close_conn()
                    return "\n".join(rep)
                close_conn()
                return "Aucun congé."
        else:
            # Si on n'a pas accès à la DB, on regarde dans user_context
            txt_conges = user_context.get("info_conges", "").strip()
            close_conn()
            return txt_conges if txt_conges else "Aucun congé."

    elif selected_intent == "arret":
        if utilisateur_db:
            user_email_db = utilisateur_db["email"]
            curseur.execute("""
                SELECT date_debut, date_fin, type_maladie, statut
                FROM demandes_arrêt
                WHERE employe_email = ?
                ORDER BY id DESC
            """, (user_email_db,))
            rows = curseur.fetchall()
            if rows:
                rep = []
                for a in rows:
                    rep.append(f"{a['type_maladie']} du {a['date_debut']} au {a['date_fin']} ({a['statut']})")
                close_conn()
                return "\n".join(rep)
            close_conn()
            return "Aucun arrêt maladie."
        else:
            arrs = user_context.get("info_arrets", "").strip()
            close_conn()
            return arrs if arrs else "Aucun arrêt maladie."

    elif selected_intent == "teletravail":
        if utilisateur_db:
            user_id = utilisateur_db["id"]
            today = datetime.today().date()
            monday = today - timedelta(days=today.weekday())
            sunday = monday + timedelta(days=6)

            curseur.execute("""
                SELECT date_teletravail
                FROM teletravail
                WHERE id_employe = ?
                ORDER BY date_teletravail ASC
            """, (user_id,))
            tele = curseur.fetchall()

            rep = []
            jour_mapping = {
                "Monday": "Lundi",
                "Tuesday": "Mardi",
                "Wednesday": "Mercredi",
                "Thursday": "Jeudi",
                "Friday": "Vendredi",
                "Saturday": "Samedi",
                "Sunday": "Dimanche"
            }
            for t in tele:
                raw_date = t['date_teletravail']
                try:
                    dt = datetime.strptime(raw_date.strip(), "%Y-%m-%d").date()
                except ValueError:
                    continue
                if monday <= dt <= sunday:
                    jour_fr = jour_mapping.get(dt.strftime("%A"), dt.strftime("%A"))
                    rep.append(f"{jour_fr}: {dt.strftime('%Y-%m-%d')}")

            close_conn()
            return "\n".join(rep) if rep else "Aucun jour de télétravail cette semaine."
        else:
            fallback_tele = user_context.get("info_teletravail", "").strip()
            close_conn()
            return fallback_tele if fallback_tele else "Aucun jour de télétravail."

    elif selected_intent == "prime":
        if utilisateur_db:
            user_id = utilisateur_db["id"]
            curseur.execute("""
                SELECT montant, motif, statut
                FROM demandes_prime
                WHERE id_employe = ?
                ORDER BY id DESC
            """, (user_id,))
            primes_emp = curseur.fetchall()
            if primes_emp:
                rep = [f"{p['montant']}€ : {p['motif']} ({p['statut']})" for p in primes_emp]
                close_conn()
                return "\n".join(rep)
            # Si l'utilisateur est manager, on peut lister les primes soumises pour d'autres
            curseur.execute("SELECT role FROM utilisateurs WHERE id = ?", (user_id,))
            role_obj = curseur.fetchone()
            if role_obj and role_obj["role"] == "manager":
                curseur.execute("""
                    SELECT dp.montant, dp.motif, dp.statut,
                           (SELECT prenom || ' ' || nom FROM utilisateurs WHERE id = dp.id_employe) as employe
                    FROM demandes_prime dp
                    WHERE dp.id_manager = ?
                    ORDER BY dp.id DESC
                """, (user_id,))
                primes_mgr = curseur.fetchall()
                if primes_mgr:
                    rep = [f"Pour {p['employe']}: {p['montant']}€ ({p['motif']}), {p['statut']}" for p in primes_mgr]
                    close_conn()
                    return "\n".join(rep)
            close_conn()
            return "Aucune prime."
        else:
            prime_ctx = user_context.get("info_primes", "").strip()
            close_conn()
            return prime_ctx if prime_ctx else "Aucune prime."

    elif selected_intent == "notification":
        notifs_ctx = user_context.get("info_notifications", "").strip()
        close_conn()
        return notifs_ctx if notifs_ctx else "Aucune notification."

    elif selected_intent == "manager" and selected_intent != "age":
        if utilisateur_db:
            user_id = utilisateur_db["id"]
            curseur.execute("SELECT id_manager FROM managers WHERE id_supervise = ?", (user_id,))
            row = curseur.fetchone()
            if row:
                manager_id = row["id_manager"]
                curseur.execute("SELECT prenom, nom FROM utilisateurs WHERE id = ?", (manager_id,))
                mgr = curseur.fetchone()
                if mgr:
                    close_conn()
                    return f"{mgr['prenom']} {mgr['nom']}"
        close_conn()
        return "Aucun manager assigné."

    close_conn()
    return "Désolé, je n'ai pas accès à ces informations."


def envoyer_notifications_teletravail():
    """
    Chaque lundi à 8h, on spamme poliment les gens pour choisir leur télétravail.
    """
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("SELECT id, email FROM utilisateurs")
    employes = cur.fetchall()

    for employe in employes:
        email = employe['email']
        contenu = "Bonjour,\n\nVeuillez choisir vos jours de télétravail pour la semaine prochaine.\n\nCordialement,\nL'équipe RH."
        sujet = "Choix des jours de télétravail"
        envoyer_email(sujet, email, contenu)
        creer_notification(email, "Veuillez choisir vos jours de télétravail pour la semaine prochaine.", "Télétravail")

    connexion.close()

scheduler = BackgroundScheduler()
scheduler.add_job(func=envoyer_notifications_teletravail, trigger="cron", day_of_week="mon", hour=8)
scheduler.start()

def get_user_role(user_id):
    """Récupère le role (admin/manager/employe) pour un user."""
    connexion = connect_db()
    cur = connexion.cursor()
    if user_id:
        cur.execute("SELECT role FROM utilisateurs WHERE id = ?", (user_id,))
        result = cur.fetchone()
    else:
        cur.execute("SELECT role FROM utilisateurs WHERE email = ?", (admin_email,))
        result = cur.fetchone()
    connexion.close()
    return result['role'] if result else None

def get_managed_employees(manager_id):
    """Renvoie la liste des IDs que le manager supervise."""
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("SELECT id_supervise FROM managers WHERE id_manager = ?", (manager_id,))
    rows = cur.fetchall()
    connexion.close()
    return [row['id_supervise'] for row in rows]

def get_user_id_by_email(email):
    """Trouver l'ID depuis l'email, super pratique."""
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("SELECT id FROM utilisateurs WHERE email = ?", (email,))
    result = cur.fetchone()
    connexion.close()
    return result['id'] if result else None

scheduler = BackgroundScheduler()
scheduler.start()

def envoyer_rappel_feedback():
    # Récupérer tous les emails employés
    connexion = connect_db()
    cur = connexion.cursor()
    cur.execute("SELECT email FROM utilisateurs WHERE role != 'admin'")
    all_emails = [row['email'] for row in cur.fetchall()]
    connexion.close()

    for mail_employe in all_emails:
        sujet = "Nouveau Feedback Mensuel"
        contenu = f"""
        Bonjour,

        Nous sommes le 1er du mois ! Pensez à laisser votre feedback mensuel :
        http://votre-domaine.fr/feedback

        Merci,
        L'équipe RH
        """
        envoyer_email(sujet, mail_employe, contenu)

scheduler.add_job(envoyer_rappel_feedback, 'cron', day=1, hour=8, minute=0)
