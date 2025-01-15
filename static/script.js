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
                // Supprimer la notification de la liste sans recharger la page
                const notificationElement = document.querySelector(`[onclick="supprimerNotification(${id})"]`).closest('li');
                notificationElement.remove();

                // Mettre à jour le badge de notifications non lues
                const badge = document.querySelector('#notificationsDropdown .badge');
                if (badge) {
                    const count = parseInt(badge.innerText) - 1;
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

    employeeCards.forEach(card => {
        const name = card.getAttribute('data-name').toLowerCase();
        if (name.includes(searchInput)) {
            card.style.display = '';
        } else {
            card.style.display = 'none';
        }
    });
}



// Faire disparaître les messages flash après 5 secondes
setTimeout(function() {
    const alerts = document.querySelectorAll('.alert');
    alerts.forEach(alert => {
        alert.classList.add('fade');
        setTimeout(() => alert.remove(), 500);
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
