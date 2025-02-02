/* ********************************************************************************************
   script.js : Fichier JavaScript regroupant diverses fonctionnalités front-end
   - Gestion des congés (affichage, surbrillance)
   - Gestion des notifications (création, suppression, marquage comme lues)
   - Recherches employé/demande via champ input
   - Gestion et agrandissement de cartes (demandes)
   - Sélection de nationalité, département et pays (API externe)
   - Réinitialisation de mot de passe via email
   - Utilisation de DataTables pour la gestion de tableaux
   - Confirmation d'actions (SweetAlert)
   - Gestion du télétravail (prochaine semaine)
   - Recadrage d'image (Cropper.js)
******************************************************************************************** */

/* *******************************
   1) Gestion de l'affichage des employés en congé
******************************* */
function showEmployees(day) {
    // Récupérer les employés qui sont en congé ce jour-là via les données envoyées par le serveur
    let employeesList = document.getElementById('employeesList');
    let modal = document.getElementById('modal');
    
    fetch('/get_employees_conge/' + day)
        .then(response => response.json())
        .then(data => {
            employeesList.innerHTML = '';  // Efface la liste précédente

            if (data && data.length > 0) {
                data.forEach(emp => {
                    let div = document.createElement('div');
                    div.innerHTML = `${emp.nom} (${emp.date_debut} - ${emp.date_fin})`;
                    // Mise en évidence des jours de l'employé au clic
                    div.onclick = function() {
                        highlightEmployeeDays(emp.email);
                    };
                    employeesList.appendChild(div);
                });
            } else {
                employeesList.innerHTML = "Aucun employé en congé ce jour-là.";
            }
            // Affiche la modale
            modal.style.display = 'flex';
        });
}

/* *******************************
   2) Fermeture de la modale
******************************* */
function closeModal() {
    document.getElementById('modal').style.display = 'none';
}

/* *******************************
   3) Surligner les jours de congé d'un employé
******************************* */
function highlightEmployeeDays(email) {
    // Highlight all days where this employee has taken leave
    let allDays = document.querySelectorAll('.day');
    allDays.forEach(day => {
        let dayNum = parseInt(day.querySelector('span').textContent);
        fetch(`/get_employee_leave_days/${email}`)
            .then(response => response.json())
            .then(data => {
                data.forEach(solde_congé => {
                    if (solde_congé.day === dayNum) {
                        day.style.backgroundColor = 'green';
                    }
                });
            });
    });
}

/* *******************************
   4) Gestion des notifications (marquer comme lues)
******************************* */
document.addEventListener('DOMContentLoaded', function () {
    var notificationsDropdown = document.getElementById('notificationsDropdown');
    notificationsDropdown.addEventListener('click', function () {
        fetch('/mark_notifications_as_read', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Supprimer le badge des notifications non lues
                var badge = notificationsDropdown.querySelector('.badge');
                if (badge) badge.remove();
            }
        })
        .catch(error => console.error('Erreur:', error));
    });
});

/* *******************************
   5) Toggle du panneau de notifications
******************************* */
function toggleNotificationPanel() {
    const panel = document.getElementById('notification-panel');
    panel.style.display = (panel.style.display === 'none' || panel.style.display === '') ? 'block' : 'none';
}

/* *******************************
   6) Suppression d'une notification
******************************* */
function supprimerNotification(id) {
    Swal.fire({
        title: 'Êtes-vous sûr ?',
        text: "Cette action est irréversible !",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Oui, supprimer',
        cancelButtonText: 'Annuler'
    }).then((result) => {
        if (result.isConfirmed) {
            fetch(`/supprimer_notification/${id}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    document.querySelector(`[onclick="supprimerNotification(${id})"]`).closest('.notification-item').remove();
                    
                    // Mettre à jour le badge des notifications
                    const badge = document.querySelector('#notification-icon .badge');
                    if (badge) {
                        let count = parseInt(badge.innerText) - 1;
                        if (count > 0) {
                            badge.innerText = count;
                        } else {
                            badge.remove();
                        }
                    }

                    // Affichage d'une alerte de succès
                    Swal.fire({
                        title: 'Supprimée !',
                        text: 'La notification a été supprimée avec succès.',
                        icon: 'success',
                        confirmButtonText: 'OK'
                    });
                }
            })
            .catch(error => {
                console.error('Erreur :', error);
                Swal.fire({
                    title: 'Erreur',
                    text: 'Une erreur est survenue lors de la suppression.',
                    icon: 'error',
                    confirmButtonText: 'OK'
                });
            });
        }
    });
}


/* *******************************
   7) Recherche d'employés par nom
******************************* */
function searchEmployee() {
    const searchInput = document.getElementById('searchInput').value.toLowerCase();
    const employeeCards = document.querySelectorAll('.employee-card');
    let hasResults = false;

    employeeCards.forEach(card => {
        const name = card.getAttribute('data-name').toLowerCase();
        if (name.includes(searchInput)) {
            card.style.display = '';
            hasResults = true;
        } else {
            card.style.display = 'none';
        }
    });

    if (!hasResults) {
        // Afficher l'alerte SweetAlert si aucun résultat trouvé
        Swal.fire({
            icon: 'info',
            title: 'Aucun résultat',
            text: 'Aucun employé trouvé pour la recherche effectuée.',
            confirmButtonText: 'OK',
            customClass: {
                popup: 'swal2-custom-popup'
            }
        }).then(() => {
            // Actualiser la page après la fermeture de l'alerte
            location.reload();
        });
    }
}

/* *******************************
   8) Agrandir et réduire une carte (demande)
******************************* */
function agrandirCarte(card) {
    // Vérifiez si une carte est déjà agrandie
    if (
        event.target.tagName === 'BUTTON' ||
        event.target.tagName === 'A' ||
        event.target.tagName === 'INPUT' ||
        event.target.closest('.no-zoom')
    ) {
        return; // Ne rien faire si un bouton ou un lien est cliqué
    }
    const carteAgrandie = document.querySelector('.demande-card.agrandie');
    if (carteAgrandie) {
        carteAgrandie.classList.remove('agrandie');
        document.body.classList.remove('flou');
    }

    // Ajoutez la classe agrandie à la carte cliquée
    card.classList.add('agrandie');
    document.body.classList.add('flou');
}

// Événement global pour fermer la carte si clic en dehors
document.body.addEventListener('click', function(e) {
    if (!e.target.closest('.demande-card')) {
        const carteAgrandie = document.querySelector('.demande-card.agrandie');
        if (carteAgrandie) {
            carteAgrandie.classList.remove('agrandie');
            document.body.classList.remove('flou');
        }
    }
});

/* *******************************
   9) Recherche d'une demande (admin/manager)
******************************* */
function searchDemande() {
    const searchInput = document.getElementById('searchInput').value.toLowerCase();
    const demandes = document.querySelectorAll('.demande-card');
    let hasResults = false;

    demandes.forEach(card => {
        const immatricule = card.querySelector('.card-title').textContent.toLowerCase();
        if (immatricule.includes(searchInput)) {
            card.style.display = '';
            hasResults = true;
        } else {
            card.style.display = 'none';
        }
    });

    if (!hasResults) {
        Swal.fire({
            icon: 'info',
            title: 'Aucun résultat',
            text: 'Aucune demande trouvée pour l\'employé recherché.',
            confirmButtonText: 'OK',
            customClass: {
                popup: 'swal2-custom-popup'
            }
        }).then(() => {
            location.reload();
        });
    }
}

/* *******************************
   10) Recherche d'une demande (employé)
******************************* */
function searchDemandeEmploye() {
    const searchInput = document.getElementById('searchInput').value.toLowerCase();
    const demandes = document.querySelectorAll('.demande-card');
    let hasResults = false;

    demandes.forEach(card => {
        const immatricule = card.querySelector('.card-title').textContent.toLowerCase();
        if (immatricule.includes(searchInput)) {
            card.style.display = '';
            hasResults = true;
        } else {
            card.style.display = 'none';
        }
    });

    if (!hasResults) {
        Swal.fire({
            icon: 'info',
            title: 'Aucun résultat',
            text: 'Aucune demande trouvée pour l\'id recherché.',
            confirmButtonText: 'OK',
            customClass: {
                popup: 'swal2-custom-popup'
            }
        }).then(() => {
            location.reload();
        });
    }
}

/* *******************************
   11) Remplissage automatique de la liste de nationalités
******************************* */
document.addEventListener('DOMContentLoaded', function () {
    const nationalites = [
        "Afghane","Albanaise","Algérienne","Allemande","Américaine","Anglaise","Angolaise","Argentine","Arménienne",
        "Australienne","Autrichienne","Azerbaïdjanaise","Bahreïnie","Bangladaise","Belge","Béninoise","Bhoutanaise",
        "Biélorusse","Birmane","Bolivienne","Bosnienne","Botswanaise","Brésilienne","Bruneienne","Bulgare","Burkinabè",
        "Burundaise","Cambodgienne","Camerounaise","Canadienne","Cap-verdienne","Centrafricaine","Chilienne","Chinoise",
        "Chypriote","Colombienne","Comorienne","Congolaise","Costaricaine","Croate","Cubaine","Danoise","Djiboutienne",
        "Dominicaine","Égyptienne","Émiratie","Équatorienne","Érythréenne","Espagnole","Estonienne","Éthiopienne",
        "Fidjienne","Finlandaise","Française","Gabonaise","Gambienne","Géorgienne","Ghanéenne","Grecque","Guatémaltèque",
        "Guinéenne","Haïtienne","Hondurienne","Hongroise","Indienne","Indonésienne","Iranienne","Irakienne","Irlandaise",
        "Islandaise","Israélienne","Italienne","Ivoirienne","Jamaïcaine","Japonaise","Jordanienne","Kazakhstanaise",
        "Kényane","Kirghize","Laotienne","Libanaise","Libérienne","Libyenne","Lituanienne","Luxembourgeoise","Malaisienne",
        "Malienne","Maltaise","Marocaine","Mauricienne","Mexicaine","Monégasque","Mozambicaine","Namibienne","Néerlandaise",
        "Népalaise","Nigériane","Nigérienne","Norvégienne","Pakistanaise","Palestinienne","Panaméenne","Paraguayenne",
        "Péruvienne","Philippine","Polonaise","Portugaise","Qatarienne","Roumaine","Russe","Rwandaise","Salvadorienne",
        "Sénégalaise","Serbe","Singapourienne","Slovaque","Slovène","Somalienne","Soudanaise","Sri-lankaise","Suédoise",
        "Suisse","Syrienne","Tadjike","Tanzanienne","Thaïlandaise","Togolaise","Tunisienne","Turque","Ukrainienne","Uruguayenne",
        "Vénézuélienne","Vietnamienne","Yéménite","Zambienne","Zimbabwéenne"
    ];

    const selectNationalite = document.getElementById('nationalite');
    nationalites.forEach(nationalite => {
        const option = document.createElement('option');
        option.value = nationalite;
        option.textContent = nationalite;
        selectNationalite.appendChild(option);
    });
});

/* *******************************
   12) Remplissage automatique de la liste de départements
******************************* */
document.addEventListener('DOMContentLoaded', function () {
    const departements = [
        "Ressources Humaines","Finance","Comptabilité","Marketing","Ventes","Service Client","Production",
        "Recherche et Développement","Logistique","Informatique","Qualité","Achats","Juridiques","Communication",
        "Direction Générale"
    ];

    const selectdepartement = document.getElementById('departement');
    departements.forEach(departement => {
        const option = document.createElement('option');
        option.value = departement;
        option.textContent = departement;
        selectdepartement.appendChild(option);
    });
});

/* *******************************
   13) Remplissage automatique de la liste des pays via une API
   et auto-complétion de la ville depuis le code postal (API zippopotam)
******************************* */
document.addEventListener('DOMContentLoaded', function () {
    // Remplir la liste des pays
    const selectPays = document.getElementById('pays');
    fetch('https://restcountries.com/v3.1/all')
        .then(response => response.json())
        .then(data => {
            // Trier les pays par ordre alphabétique
            const sortedCountries = data.sort((a, b) => a.name.common.localeCompare(b.name.common));
            selectPays.innerHTML = '<option value="">Sélectionner un pays</option>';
            sortedCountries.forEach(country => {
                const option = document.createElement('option');
                option.value = country.name.common;
                option.textContent = country.name.common;
                selectPays.appendChild(option);
            });
        })
        .catch(error => {
            console.error('Erreur lors du chargement des pays:', error);
            selectPays.innerHTML = '<option value="">Erreur de chargement</option>';
        });

    // Remplir automatiquement la ville à partir du code postal
    const codePostalInput = document.getElementById('code_postal');
    const villeInput = document.getElementById('ville');

    codePostalInput.addEventListener('input', function () {
        const codePostal = codePostalInput.value.trim();

        // Vérifie que le code postal est valide (5 chiffres)
        if (/^\d{5}$/.test(codePostal)) {
            fetch(`https://api.zippopotam.us/fr/${codePostal}`)
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Code postal introuvable');
                    }
                    return response.json();
                })
                .then(data => {
                    villeInput.value = data.places[0]['place name'];
                })
                .catch(error => {
                    console.error('Erreur lors du chargement de la ville:', error);
                    villeInput.value = '';
                });
        } else {
            // Réinitialise si le code postal est incomplet
            villeInput.value = '';
        }
    });
});

/* *******************************
   14) Envoi d'email de réinitialisation de mot de passe
******************************* */
function envoyerEmailReinitialisation(email) {
    fetch(`/envoyer_email_reinitialisation?email=${encodeURIComponent(email)}`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                Swal.fire({
                    icon: 'success',
                    title: 'Succès',
                    text: 'Email de réinitialisation envoyé avec succès.',
                    confirmButtonText: 'OK'
                });
            } else {
                alert('Erreur lors de l\'envoi de l\'email.');
                Swal.fire({
                    icon: 'error',
                    title: 'Erreur',
                    text: 'Erreur lors de l\'envoi de l\'email.',
                    confirmButtonText: 'OK'
                });
            }
        })
}

/* *******************************
   15) Initialisation de DataTables pour le tableau de réunions
******************************* */
document.addEventListener('DOMContentLoaded', function () {
    $('#meetingsTable').DataTable({
        language: {
            url: 'https://cdn.datatables.net/plug-ins/1.13.5/i18n/fr-FR.json'
        },
        responsive: true,
        initComplete: function () {
            // Déplace la barre de recherche à droite de "Afficher X éléments"
            const lengthControl = document.querySelector('.dataTables_length');
            const filterControl = document.querySelector('.dataTables_filter');
            const wrapper = document.querySelector('.dataTables_wrapper');
            const header = document.createElement('div');
            header.style.display = 'flex';
            header.style.justifyContent = 'space-between';
            header.style.alignItems = 'center';
            wrapper.insertBefore(header, wrapper.firstChild);
            header.appendChild(lengthControl);
            header.appendChild(filterControl);
        }
    });
});

/* *******************************
   16) Confirmation de suppression via SweetAlert
******************************* */
function confirmerSuppression(event) {
    event.preventDefault(); // Empêche l'action par défaut pour attendre la confirmation
    Swal.fire({
        title: 'Êtes-vous sûr ?',
        text: "Cette action est irréversible.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Oui, supprimer',
        cancelButtonText: 'Annuler'
    }).then((result) => {
        if (result.isConfirmed) {
            // Si l'utilisateur confirme, soumettez le formulaire
            event.target.closest('form').submit();
        }
    });
}

/* *******************************
   17) Confirmation d'action (submission, reset, etc.)
******************************* */
function confirmAction(event, message = "Êtes-vous sûr de vouloir effectuer cette action ?") {
    event.preventDefault(); // Empêche l'action par défaut
    Swal.fire({
        title: 'Confirmation',
        text: "{{message}}",
        icon: 'question',
        html: true,
        showCancelButton: true,
        confirmButtonColor: '#28a745',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Oui, continuer',
        cancelButtonText: 'Annuler'
    }).then((result) => {
        if (result.isConfirmed) {
            event.target.closest('form').submit();
        }
    });
}

function confirmAction(title, message, button, actionType) {
    Swal.fire({
        title: title,
        text: message,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: actionType === 'cancel' ? '#6c757d'
                          : actionType === 'reset' ? '#007bff'
                          : '#28a745',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Oui',
        cancelButtonText: 'Non',
    }).then((result) => {
        if (result.isConfirmed) {
            if (actionType === 'reset') {
                // Call the password reset function
                const email = button.getAttribute('data-email'); // data-email si besoin
                envoyerEmailReinitialisation(email);
            } else if (actionType === 'submit') {
                // Soumet le formulaire
                const form = button.closest('form');
                if (form) {
                    form.submit();
                }
            }
        }
    });
}

/* *******************************
   18) Gestion des alertes Flash (SweetAlert)
******************************* */
document.addEventListener('DOMContentLoaded', () => {
    const alerts = document.querySelectorAll('.alert'); // Sélectionne toutes les alertes Flash

    alerts.forEach(alert => {
        const type = alert.classList.contains('alert-success')
            ? 'success'
            : alert.classList.contains('alert-danger')
            ? 'error'
            : alert.classList.contains('alert-warning')
            ? 'warning'
            : 'info';

        Swal.fire({
            icon: type,
            title: type === 'success' ? 'Succès' : 'Attention',
            text: alert.textContent.trim(),
            confirmButtonText: 'OK',
            customClass: {
                popup: 'swal2-custom-popup',
            },
        });

        // Supprime le message Flash après affichage
        alert.remove();
    });
});

/* *******************************
   19) Traitement d'une demande (accept/refuse)
******************************* */
function handleAction(button, status) {
    const form = button.closest('form');
    const statutInput = form.querySelector('[name="statut"]');
    const motifTextarea = form.querySelector('textarea[name="motif_refus"]');

    // Set the status (accepte ou refuse)
    statutInput.value = status;

    // Si refus, exiger un motif
    if (status === 'refuse') {
        const motif = motifTextarea?.value.trim();
        if (!motif) {
            Swal.fire({
                icon: 'warning',
                title: 'Motif requis',
                text: 'Veuillez fournir un motif pour refuser la demande.',
                confirmButtonText: 'OK'
            });
            return;
        }
    }

    // Boîte de confirmation SweetAlert
    const actionText = status === 'accepte' ? 'accepter' : 'refuser';
    Swal.fire({
        title: 'Confirmation',
        text: `Êtes-vous sûr de vouloir ${actionText} cette demande ?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: status === 'accepte' ? '#28a745' : '#d33',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Oui, continuer',
        cancelButtonText: 'Annuler',
    }).then((result) => {
        if (result.isConfirmed) {
            form.submit();
        }
    });
}

function handleMeetingAction(button, status) {
    // Récupère le formulaire parent
    const form = button.closest('form');
    
    // Affecte la valeur de la réponse dans le champ caché
    const responseInput = form.querySelector('input[name="response"]');
    responseInput.value = status;
    
    // Prépare le texte de l'action en fonction du statut
    const actionText = status === 'Accepted' ? 'accepter' : 'refuser';
    
    // Affiche la boîte de confirmation avec SweetAlert
    Swal.fire({
      title: 'Confirmation',
      text: `Êtes-vous sûr de vouloir ${actionText} cette invitation ?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: status === 'Accepted' ? '#28a745' : '#d33',
      cancelButtonColor: '#6c757d',
      confirmButtonText: 'Oui, continuer',
      cancelButtonText: 'Annuler'
    }).then((result) => {
      if (result.isConfirmed) {
        // Soumet le formulaire si l'utilisateur confirme
        form.submit();
      }
    });
  }
  
/* *******************************
   20) Sélection / Désélection de tous les éléments
******************************* */
function selectAll() {
    document.querySelectorAll('.checkbox-item').forEach(checkbox => {
        checkbox.checked = true;
    });
}

function deselectAll() {
    document.querySelectorAll('.checkbox-item').forEach(checkbox => {
        checkbox.checked = false;
    });
}

/* *******************************
   21) Suppression multiple d'éléments sélectionnés
******************************* */
function deleteSelectedItems(table) {
    const selectedIds = Array.from(document.querySelectorAll('.checkbox-item:checked'))
        .map(checkbox => checkbox.value);

    if (selectedIds.length === 0) {
        Swal.fire({
            icon: 'info',
            title: 'Aucun élément sélectionné',
            text: 'Veuillez sélectionner au moins un élément à supprimer.'
        });
        return;
    }

    Swal.fire({
        title: 'Confirmation',
        text: `Êtes-vous sûr de vouloir supprimer les éléments sélectionnés ?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Oui, supprimer',
        cancelButtonText: 'Annuler'
    }).then(result => {
        if (result.isConfirmed) {
            fetch(`/supprimer_elements/${table}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ ids: selectedIds })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    Swal.fire({
                        icon: 'success',
                        title: 'Succès',
                        text: data.message
                    }).then(() => location.reload());
                } else {
                    Swal.fire({
                        icon: 'error',
                        title: 'Erreur',
                        text: data.message
                    });
                }
            })
            .catch(error => {
                console.error('Erreur:', error);
                Swal.fire({
                    icon: 'error',
                    title: 'Erreur',
                    text: 'Une erreur est survenue lors de la suppression.'
                });
            });
        }
    });
}

/* *******************************
   22) Calcul et affichage des jours de la semaine prochaine (Télétravail)
******************************* */
function getNextWeekDays() {
    const daysContainer = document.getElementById('teletravail-days');
    const daysOfWeek = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];
    const today = new Date();
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + ((1 + 7 - today.getDay()) % 7 || 7));  // Calcule le lundi suivant

    for (let i = 0; i < 5; i++) {
        const day = new Date(nextMonday);
        day.setDate(nextMonday.getDate() + i);  // Ajoute les jours à partir du lundi suivant
        console.log(day)
        const dayName = daysOfWeek[i];
        const formattedDate = day.toLocaleDateString('fr-CA'); // YYYY-MM-DD format

        const dayHTML = `
            <div class="day-card" data-date="${formattedDate}">
                <input type="checkbox" name="jours_teletravail" value="${formattedDate}" id="day-${i}">
                <div class="day-title">${dayName}</div>
                <div class="day-date">${day.getDate()} ${day.toLocaleString('fr-FR', { month: 'long' })} ${day.getFullYear()}</div>
            </div>
        `;
        daysContainer.innerHTML += dayHTML;
    }

    // Ajout de l'interaction pour les cartes
    const dayCards = document.querySelectorAll('.day-card');
    dayCards.forEach(card => {
        card.addEventListener('click', () => {
            const checkbox = card.querySelector('input[type="checkbox"]');
            checkbox.checked = !checkbox.checked;
            card.classList.toggle('checked', checkbox.checked);
        });
    });
}
document.addEventListener('DOMContentLoaded', getNextWeekDays);



/* *******************************
   23) Validation du formulaire d'arrêt maladie (justificatif obligatoire)
******************************* */
document.addEventListener('DOMContentLoaded', () => {
    function validerFormulaire(event) {
        const typeMaladie = document.getElementById('type_maladie').value;
        const pieceJointe = document.getElementById('piece_jointe').files.length;
        const errorMessage = document.getElementById("date-error-message"); // Éventuel message d'erreur

        if (errorMessage) errorMessage.style.display = "none";

        // Vérifier si la pièce jointe est manquante pour une demande justifiée
        if (typeMaladie === 'justifie' && pieceJointe === 0) {
            Swal.fire({
                icon: 'warning',
                title: 'Justificatif requis',
                text: 'Veuillez fournir un justificatif pour une demande justifiée.',
                confirmButtonText: 'OK'
            });
            event.preventDefault(); // Empêcher l'envoi du formulaire
            return;
        }
    }

    const form = document.querySelector('form');
    form.addEventListener('submit', validerFormulaire);
});

/* *******************************
   24) Gestion du recadrage d'images (Cropper.js)
******************************* */
let cropper;

document.getElementById('photoInput').addEventListener('change', function (event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            document.getElementById('imageToCrop').src = e.target.result;
            const cropperModal = new bootstrap.Modal(document.getElementById('cropperModal'));
            cropperModal.show();
        };
        reader.readAsDataURL(file);
    }
});

document.getElementById('cropperModal').addEventListener('shown.bs.modal', function () {
    const image = document.getElementById('imageToCrop');
    cropper = new Cropper(image, {
        aspectRatio: 1,
        viewMode: 2
    });
});

document.getElementById('cropperModal').addEventListener('hidden.bs.modal', function () {
    if (cropper) {
        cropper.destroy();
        cropper = null;
    }
});

document.getElementById('cropButton').addEventListener('click', function () {
    const canvas = cropper.getCroppedCanvas({
        width: 300,
        height: 300
    });

    const preview = document.getElementById('photoPreview');
    preview.src = canvas.toDataURL();
    document.getElementById('photoPreviewContainer').classList.remove('d-none');

    canvas.toBlob(function (blob) {
        const fileInput = document.getElementById('photoInput');
        const dataTransfer = new DataTransfer();
        const uniqueName = `photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.png`;
        dataTransfer.items.add(new File([blob], uniqueName, { type: 'image/png' }));
        fileInput.files = dataTransfer.files;
    });

    const modal = bootstrap.Modal.getInstance(document.getElementById('cropperModal'));
    modal.hide();
});
