from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, validators

# Définition de la classe LoginForm, héritant de FlaskForm
class LoginForm(FlaskForm):
    email = StringField(
        'Email',
        render_kw={"placeholder": "Entrez votre email"}
    )
    mot_de_passe = PasswordField(
        'Mot de passe',
        [validators.DataRequired(message="Le mot de passe est requis")],
        render_kw={"placeholder": "Entrez votre mot de passe"}
    )