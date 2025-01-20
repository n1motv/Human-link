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
        } else {
            card.style.display = 'none';
            hasResults = true;
        }
    });
    const errorMessage = document.getElementById('error-message');
    if (!hasResults) {
        errorMessage.classList.remove('d-none');
    } else {
        errorMessage.classList.add('d-none');
    }
}



// Faire disparaître les messages flash après 5 secondes
setTimeout(function() {
    const alerts = document.querySelectorAll('.alert');
    alerts.forEach(alert => {
        alert.classList.add('fade');
        setTimeout(() => alert.remove(), 1000);
    });
}, 5000);

function agrandirCarte(card) {
    // Vérifiez si une carte est déjà agrandie
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

function confirmerSuppression(event) {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cet élément ? Cette action est irréversible.")) {
        event.preventDefault();
    }
}
function searchDemande() {
    const searchInput = document.getElementById('searchInput').value.toLowerCase();
    const arrets = document.querySelectorAll('.demande-card');
    let hasResults = false;

    arrets.forEach(card => {
        const email = card.querySelector('.card-title').textContent.toLowerCase();
        if (email.includes(searchInput)) {
            card.style.display = '';
            hasResults = true;
        } else {
            card.style.display = 'none';
        }
    });

    const errorMessage = document.getElementById('error-message');
    if (!hasResults) {
        errorMessage.classList.remove('d-none');
    } else {
        errorMessage.classList.add('d-none');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const alertBox = document.querySelector('.alert');

    if (alertBox) {
        // Affiche l'alerte pendant 5 secondes
        setTimeout(() => {
            alertBox.style.transition = 'opacity 0.5s ease';
            alertBox.style.opacity = '0';

            // Supprime l'élément du DOM après la transition
            setTimeout(() => {
                alertBox.remove();
            }, 500);
        }, 5000);
    }
});

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
    if (confirm(`Voulez-vous vraiment envoyer un email de réinitialisation de mot de passe à ${email} ?`)) {
        fetch(`/envoyer_email_reinitialisation?email=${encodeURIComponent(email)}`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    alert('Email de réinitialisation envoyé avec succès.');
                } else {
                    alert('Erreur lors de l\'envoi de l\'email.');
                }
            })
            .catch(error => {
                console.error('Erreur :', error);
                alert('Une erreur est survenue.');
            });
    }
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
