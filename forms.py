from flask_wtf import FlaskForm
from wtforms import StringField, PasswordField, validators

class LoginForm(FlaskForm):
    email = StringField(
        'Email',
        [validators.Email(message="Entrez un email valide")],
        render_kw={"placeholder": "Entrez votre email"}
    )
    mot_de_passe = PasswordField(
        'Mot de passe',
        [validators.DataRequired(message="Le mot de passe est requis")],
        render_kw={"placeholder": "Entrez votre mot de passe"}
    )