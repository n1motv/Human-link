function showEmployees(day) {
    // Récupérer les employés qui sont en congé ce jour-là via les données envoyées par le serveur
    let employeesList = document.getElementById('employeesList');
    let modal = document.getElementById('modal');
    
    fetch('/get_employees_conge/' + day)
        .then(response => response.json())
        .then(data => {
            employeesList.innerHTML = '';  // Clear previous list
            if (data && data.length > 0) {
                data.forEach(emp => {
                    let div = document.createElement('div');
                    div.innerHTML = `${emp.nom} (${emp.date_debut} - ${emp.date_fin})`;
                    div.onclick = function() {
                        highlightEmployeeDays(emp.email);
                    };
                    employeesList.appendChild(div);
                });
            } else {
                employeesList.innerHTML = "Aucun employé en congé ce jour-là.";
            }
            modal.style.display = 'flex';
        });
}

function closeModal() {
    document.getElementById('modal').style.display = 'none';
}

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
function toggleNotificationPanel() {
    const panel = document.getElementById('notification-panel');
    panel.style.display = (panel.style.display === 'none' || panel.style.display === '') ? 'block' : 'none';
}
function supprimerNotification(id) {
    if (confirm("Êtes-vous sûr de vouloir supprimer cette notification ?")) {
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
                const badge = document.querySelector('#notification-icon .badge');
                if (badge) {
                    let count = parseInt(badge.innerText) - 1;
                    if (count > 0) {
                        badge.innerText = count;
                    } else {
                        badge.remove();
                    }
                }
            }
        })

        .catch(error => console.error('Erreur :', error));
    }
}

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



function agrandirCarte(card) {
    // Vérifiez si une carte est déjà agrandie
    if (
        event.target.tagName === 'BUTTON' || // Bouton
        event.target.tagName === 'A' ||      // Lien
        event.target.tagName === 'INPUT' ||      // Lien
        event.target.closest('.no-zoom')     // Éléments avec classe `no-zoom`
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

document.body.addEventListener('click', function(e) {
    // Fermer la carte agrandie si vous cliquez en dehors
    if (!e.target.closest('.demande-card')) {
        const carteAgrandie = document.querySelector('.demande-card.agrandie');
        if (carteAgrandie) {
            carteAgrandie.classList.remove('agrandie');
            document.body.classList.remove('flou');
        }
    }
});


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
        // Afficher l'alerte SweetAlert si aucun résultat trouvé
        Swal.fire({
            icon: 'info',
            title: 'Aucun résultat',
            text: 'Aucune demande trouvée pour l\'employé recherché.',
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


document.addEventListener('DOMContentLoaded', function () {
    const nationalites = ["Afghane", "Albanaise", "Algérienne", "Allemande", "Américaine", "Anglaise", "Angolaise",
    "Argentine", "Arménienne", "Australienne", "Autrichienne", "Azerbaïdjanaise", "Bahreïnie", "Bangladaise", 
    "Belge", "Béninoise", "Bhoutanaise", "Biélorusse", "Birmane", "Bolivienne", "Bosnienne", "Botswanaise", 
    "Brésilienne", "Bruneienne", "Bulgare", "Burkinabè", "Burundaise", "Cambodgienne", "Camerounaise", "Canadienne",
    "Cap-verdienne", "Centrafricaine", "Chilienne", "Chinoise", "Chypriote", "Colombienne", "Comorienne", 
    "Congolaise", "Costaricaine", "Croate", "Cubaine", "Danoise", "Djiboutienne", "Dominicaine", "Égyptienne",
    "Émiratie", "Équatorienne", "Érythréenne", "Espagnole", "Estonienne", "Éthiopienne", "Fidjienne", 
    "Finlandaise", "Française", "Gabonaise", "Gambienne", "Géorgienne", "Ghanéenne", "Grecque", "Guatémaltèque",
        "Guinéenne", "Haïtienne", "Hondurienne", "Hongroise", "Indienne", "Indonésienne", "Iranienne", "Irakienne", 
        "Irlandaise", "Islandaise", "Israélienne", "Italienne", "Ivoirienne", "Jamaïcaine", "Japonaise", 
        "Jordanienne", "Kazakhstanaise", "Kényane", "Kirghize", "Laotienne", "Libanaise", "Libérienne", "Libyenne", 
        "Lituanienne", "Luxembourgeoise", "Malaisienne", "Malienne", "Maltaise", "Marocaine", "Mauricienne", "Mexicaine", 
        "Monégasque", "Mozambicaine", "Namibienne", "Néerlandaise", "Népalaise", "Nigériane", "Nigérienne", "Norvégienne", 
        "Pakistanaise", "Palestinienne", "Panaméenne", "Paraguayenne", "Péruvienne", "Philippine", "Polonaise", "Portugaise", 
        "Qatarienne", "Roumaine", "Russe", "Rwandaise", "Salvadorienne", "Sénégalaise", "Serbe", "Singapourienne", "Slovaque", "Slovène", 
        "Somalienne", "Soudanaise", "Sri-lankaise", "Suédoise", "Suisse", "Syrienne", "Tadjike", "Tanzanienne", "Thaïlandaise", "Togolaise", 
        "Tunisienne", "Turque", "Ukrainienne", "Uruguayenne", "Vénézuélienne", "Vietnamienne", "Yéménite", "Zambienne", "Zimbabwéenne"
];

    const selectNationalite = document.getElementById('nationalite');
    
    nationalites.forEach(nationalite => {
        const option = document.createElement('option');
        option.value = nationalite;
        option.textContent = nationalite;
        selectNationalite.appendChild(option);
    });
});
document.addEventListener('DOMContentLoaded', function () {
    const departements = [    "Ressources Humaines","Finance","Comptabilité","Marketing","Ventes",
        "Service Client","Production","Recherche et Développement","Logistique","Informatique","Qualité",
        "Achats","Juridiques","Communication","Direction Générale"];

    const selectdepartement = document.getElementById('departement');
    
    departements.forEach(departement => {
        const option = document.createElement('option');
        option.value = departement;
        option.textContent = departement;
        selectdepartement.appendChild(option);
    });
});

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
            villeInput.value = '';  // Réinitialise si le code postal est incomplet
        }
    });
});

function envoyerEmailReinitialisation(email) {
    fetch(`/envoyer_email_reinitialisation?email=${encodeURIComponent(email)}`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    Swal.fire({
                        icon: 'success', // Icône pour le succès
                        title: 'Succès',
                        text: 'Email de réinitialisation envoyé avec succès.',
                        confirmButtonText: 'OK'
                    });
                    
                } else {
                    alert('Erreur lors de l\'envoi de l\'email.');
                    Swal.fire({
                        icon: 'error', // Icône pour le succès
                        title: 'Erreur',
                        text: 'Erreur lors de l\'envoi de l\'email.',
                        confirmButtonText: 'OK'
                    });
                    
                }
            })
}

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

function confirmAction(event, message = "Êtes-vous sûr de vouloir effectuer cette action ?") {
    event.preventDefault(); // Empêche l'action par défaut pour attendre la confirmation
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
            // Si l'utilisateur confirme, soumettez le formulaire
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
        confirmButtonColor: actionType === 'cancel' ? '#6c757d' : actionType === 'reset' ? '#007bff' : '#28a745',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Oui',
        cancelButtonText: 'Non',
    }).then((result) => {
        if (result.isConfirmed) {
            if (actionType === 'reset') {
                // Call the password reset function
                const email = button.getAttribute('data-email'); // Add data-email if needed
                envoyerEmailReinitialisation(email);
            } else if (actionType === 'submit') {
                // Submit the form
                const form = button.closest('form');
                if (form) {
                    form.submit();
                }
            }
        }
    });
}


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
            icon: type, // Utilise le type détecté : success, error, warning, info
            title: type === 'success' ? 'Succès' : 'Attention',
            text: alert.textContent.trim(), // Texte du message
            confirmButtonText: 'OK',
            customClass: {
                popup: 'swal2-custom-popup', // Personnalisation facultative
            },
        });

        // Supprime le message Flash après affichage
        alert.remove();
    });
});

function handleAction(button, status) {
    const form = button.closest('form');
    const statutInput = form.querySelector('[name="statut"]');
    const motifTextarea = form.querySelector('textarea[name="motif_refus"]');

    // Set the status (accept or refuse)
    statutInput.value = status;

    // Check if a reason is required for refusal
    if (status === 'refuse') {
        const motif = motifTextarea?.value.trim(); // Optional chaining in case the textarea is missing
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

    // Display SweetAlert2 confirmation
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
            // Submit the form after confirmation
            form.submit();
        }
    });
}


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


