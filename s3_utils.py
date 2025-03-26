import os
import boto3
from botocore.client import Config
import uuid

# Récupération des variables d’environnement
AWS_ACCESS_KEY_ID = os.getenv('AWS_ACCESS_KEY_ID')
AWS_SECRET_ACCESS_KEY = os.getenv('AWS_SECRET_ACCESS_KEY')
AWS_DEFAULT_REGION = os.getenv('AWS_DEFAULT_REGION', 'eu-north-1')
S3_BUCKET_NAME = os.getenv('S3_BUCKET_NAME')

def list_files_in_s3(prefix=""):
    """
    Liste les objets dans S3 sous un préfixe donné.
    Retourne une liste de clés (ex: "coffre_fort/bulletins/JeanDupont/abc123.pdf").
    """
    objets = s3.list_objects_v2(Bucket=S3_BUCKET_NAME, Prefix=prefix)
    if 'Contents' not in objets:
        return []
    
    keys = []
    for item in objets['Contents']:
        keys.append(item['Key'])
    return keys

# Créer un client S3
s3 = boto3.client(
    's3',
    region_name=AWS_DEFAULT_REGION,
    aws_access_key_id=AWS_ACCESS_KEY_ID,
    aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    config=Config(signature_version='s3v4')  # Pour générer des URL signées (optionnel)
)

def upload_file_to_s3(file_object, filename, folder=None):
    """
    Upload d'un fichier sur S3 en conservant son nom d'origine et en ajoutant un UUID pour l'unicité.
    """
    # Extraire l'extension et le nom original
    name, extension = os.path.splitext(filename)
    unique_id = uuid.uuid4().hex[:8]  # Raccourcir l'UUID pour lisibilité
    s3_filename = f"{name}_{unique_id}{extension}"  # Exemple: "Bulletin_01_2024_abc12345.pdf"

    if folder:
        s3_filename = f"{folder}/{s3_filename}"

    # Mettre en ligne (upload) le fichier
    s3.upload_fileobj(
        Fileobj=file_object,
        Bucket=S3_BUCKET_NAME,
        Key=s3_filename,
        ExtraArgs={
            'ACL': 'private',  # ou 'public-read' si vous voulez que le fichier soit public
            'ContentType': file_object.mimetype
        }
    )

    return s3_filename  # On retourne le chemin correct


def generate_presigned_url(key, expiration=3600):
    """
    Génère une URL signée pour télécharger un fichier S3 (valable par défaut 1h).
    """
    try:
        url = s3.generate_presigned_url(
            ClientMethod='get_object',
            Params={
                'Bucket': S3_BUCKET_NAME,
                'Key': key
            },
            ExpiresIn=expiration
        )
        return url
    except Exception as e:
        print(f"Erreur lors de la génération du lien signé : {e}")
        return None


def delete_file_from_s3(key):
    try:
        s3.delete_object(Bucket=S3_BUCKET_NAME, Key=key)
        print(f"Supprimé sur S3 : {key}")
    except Exception as e:
        print(f"Erreur lors de la suppression de {key} : {e}")
