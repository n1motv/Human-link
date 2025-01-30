import os

def count_lines_in_file(file_path):
    """
    Compte le nombre de lignes dans un fichier donné.
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            return len(file.readlines())
    except Exception as e:
        print(f"Erreur lors de la lecture du fichier {file_path}: {e}")
        return 0

def count_lines_in_project(directory, exclude_script_name):
    """
    Parcourt le répertoire et les sous-répertoires pour compter les lignes de code.
    Exclut le script lui-même et les fichiers dans le dossier .venv.
    """
    total_lines = 0
    file_line_counts = {}
    supported_extensions = {".js", ".html", ".css", ".py", ".txt"}  # Extensions supportées

    for root, _, files in os.walk(directory):
        # Ignorer les dossiers .venv
        if ".venv" in root:
            continue

        for file in files:
            # Construire le chemin complet du fichier
            file_path = os.path.join(root, file)

            # Exclure le script actuel
            if file == exclude_script_name:
                continue

            # Vérifier l'extension du fichier
            _, ext = os.path.splitext(file)
            if ext in supported_extensions:
                line_count = count_lines_in_file(file_path)
                file_line_counts[file_path] = line_count
                total_lines += line_count

    return total_lines, file_line_counts

if __name__ == "__main__":
    # Récupérer le chemin du répertoire actuel
    current_directory = os.path.dirname(os.path.abspath(__file__))

    # Nom du script actuel à exclure
    script_name = os.path.basename(__file__)

    # Compter les lignes de code
    total_lines, file_line_counts = count_lines_in_project(current_directory, script_name)

    print("Détails des lignes de chaque fichier :")
    for file_path, line_count in file_line_counts.items():
        print(f"{file_path}: {line_count} lignes")

    print(f"\nLe nombre total de lignes de code (hors ce script) est : {total_lines}")
