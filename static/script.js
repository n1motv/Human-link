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
                data.forEach(conge => {
                    if (conge.day === dayNum) {
                        day.style.backgroundColor = 'green';
                    }
                });
            });
    });
}
