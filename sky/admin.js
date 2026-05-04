const captchas = { login:'', signup:'', forgot:'' };
const API_BASE = '/api';
let currentAdmin = null;
let opportunities = [];
let editingOpportunityId = null;

const categoryLabels = {
    technology: 'Technology',
    business: 'Business',
    design: 'Design',
    marketing: 'Marketing',
    data: 'Data Science',
    other: 'Other'
};

async function apiRequest(path, options = {}) {
    const response = await fetch(API_BASE + path, {
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Something went wrong');
    return data;
}

function generateCaptcha(type) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let code = '';
    for (let i = 0; i < 5; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    captchas[type] = code;
    document.getElementById(type + 'CaptchaText').textContent = code;
}
generateCaptcha('login');
generateCaptcha('signup');
generateCaptcha('forgot');

// ===== PAGE NAVIGATION =====
function showPage(pageId) {
    document.querySelectorAll('.form-page').forEach(p => p.classList.remove('active'));
    setTimeout(() => document.getElementById(pageId).classList.add('active'), 50);
    document.querySelectorAll('.error-msg').forEach(e => e.classList.remove('show'));
    document.querySelectorAll('input').forEach(i => i.classList.remove('error'));
}

function togglePass(inputId, btn) {
    const input = document.getElementById(inputId);
    const isPass = input.type === 'password';
    input.type = isPass ? 'text' : 'password';
    btn.innerHTML = isPass
        ? '<svg viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
        : '<svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
}

// ===== HELPERS =====
function showError(id, msg) {
    const el = document.getElementById(id);
    if (msg) el.querySelector('span').textContent = msg;
    el.classList.add('show');
}
function clearAllErrors(formId) {
    document.querySelectorAll('#' + formId + ' .error-msg').forEach(e => e.classList.remove('show'));
    document.querySelectorAll('#' + formId + ' input').forEach(i => i.classList.remove('error'));
}
function shakeForm(formId) {
    const form = document.getElementById(formId);
    form.classList.add('shake');
    setTimeout(() => form.classList.remove('shake'), 400);
}
function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function showToast(msg) {
    document.getElementById('toastMsg').textContent = msg;
    document.getElementById('toast').classList.add('show');
    setTimeout(() => document.getElementById('toast').classList.remove('show'), 3000);
}

function checkStrength(val) {
    let score = 0;
    if (val.length >= 8) score++;
    if (/[A-Z]/.test(val)) score++;
    if (/[0-9]/.test(val)) score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;
    const labels = ['','Weak','Medium','Strong','Very Strong'];
    const classes = ['','weak','medium','strong','very-strong'];
    for (let i = 1; i <= 4; i++) {
        const bar = document.getElementById('str' + i);
        bar.className = 'strength-bar';
        if (i <= score) bar.classList.add(classes[score]);
    }
    document.getElementById('strengthLabel').textContent = val.length > 0 ? labels[score] : '';
}

// ===== SHOW DASHBOARD =====
function showDashboard(admin) {
    document.getElementById('authWrapper').style.display = 'none';
    document.getElementById('dashboardWrapper').classList.add('active');
    document.body.style.alignItems = 'stretch';

    currentAdmin = admin;
    const displayName = admin.fullName || admin.email.split('@')[0];
    document.getElementById('dashName').textContent = displayName;
    document.getElementById('dashAvatar').textContent = displayName.substring(0, 2).toUpperCase();
    loadOpportunities();

    // Show menu toggle on mobile
    if (window.innerWidth <= 768) {
        document.getElementById('menuToggle').style.display = 'flex';
    }
}

async function handleLogout() {
    try {
        await apiRequest('/auth/logout', { method: 'POST', body: JSON.stringify({}) });
    } catch (error) {
        console.warn(error);
    }
    currentAdmin = null;
    opportunities = [];
    document.getElementById('dashboardWrapper').classList.remove('active');
    document.getElementById('authWrapper').style.display = 'flex';
    document.body.style.alignItems = '';
    showToast('Signed out successfully');
    showPage('loginPage');
}

// ===== NAV ITEMS =====
document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', function() {
        const page = this.getAttribute('data-page');
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        this.classList.add('active');
        
        // Hide all sections
        document.querySelectorAll('.dash-section').forEach(s => s.classList.remove('active'));
        
        // Show selected section
        if (page === 'dashboard') {
            document.getElementById('dashboardSection').classList.add('active');
            document.getElementById('pageTitle').textContent = 'Dashboard';
        } else if (page === 'learner') {
            document.getElementById('learnerSection').classList.add('active');
            document.getElementById('pageTitle').textContent = 'Learner Management';
        } else if (page === 'verifier') {
            document.getElementById('verifierSection').classList.add('active');
            document.getElementById('pageTitle').textContent = 'Verifier Management';
        } else if (page === 'collaborator') {
            document.getElementById('collaboratorSection').classList.add('active');
            document.getElementById('pageTitle').textContent = 'Collaborator Management';
        } else if (page === 'opportunity') {
            document.getElementById('opportunitySection').classList.add('active');
            document.getElementById('pageTitle').textContent = 'Opportunity Management';
            loadOpportunities();
        } else if (page === 'reports') {
            document.getElementById('reportsSection').classList.add('active');
            document.getElementById('pageTitle').textContent = 'Reports and Analytics';
        }
    });
});

// ===== TABS =====
function changeChartPeriod(period) {
    // Update active tab
    document.querySelectorAll('.tabs .tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.toLowerCase() === period) {
            btn.classList.add('active');
        }
    });

    // Chart data for different periods
    const chartData = {
        daily: 'M0,120 Q50,110 100,90 T200,70 T300,50 T400,40',
        weekly: 'M0,110 Q50,95 100,85 T200,65 T300,45 T400,35',
        monthly: 'M0,100 Q50,85 100,75 T200,55 T300,40 T400,30',
        quarterly: 'M0,90 Q50,75 100,65 T200,50 T300,35 T400,25',
        yearly: 'M0,80 Q50,65 100,55 T200,40 T300,30 T400,20'
    };

    const linePath = document.getElementById('linePath');
    const lineArea = document.getElementById('lineArea');
    
    const path = chartData[period];
    linePath.setAttribute('d', path);
    lineArea.setAttribute('d', path + ' L400,150 L0,150 Z');
}

// ===== NOTIFICATIONS =====
function toggleNotifications() {
    const dropdown = document.getElementById('notificationDropdown');
    dropdown.classList.toggle('active');
}

function markAllRead() {
    document.querySelectorAll('.notif-item.unread').forEach(item => {
        item.classList.remove('unread');
    });
    showToast('All notifications marked as read');
}

// Close notification dropdown when clicking outside
document.addEventListener('click', function(e) {
    const dropdown = document.getElementById('notificationDropdown');
    const btn = document.getElementById('notifBtn');
    if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
        dropdown.classList.remove('active');
    }
});

// ===== THEME TOGGLE =====
function toggleTheme() {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', newTheme);
    
    // Update icon
    const icon = document.getElementById('themeIcon');
    if (newTheme === 'dark') {
        icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
    } else {
        icon.innerHTML = '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>';
    }
}

// ===== SEARCH =====
function openSearch() {
    document.getElementById('searchContainer').classList.add('active');
    document.getElementById('searchInput').focus();
}

function closeSearch() {
    document.getElementById('searchContainer').classList.remove('active');
}

// Close search on Escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeSearch();
        closeCourseModal();
        closeOpportunityModal();
        closeOpportunityDetailsModal();
        closeCollaboratorCoursesModal();
        closeQuickAddModal();
        closeBulkUploadModal();
        closeQuickAddVerifierModal();
        closeBulkUploadVerifierModal();
        closeVerifierDetailsModal();
    }
});

// Close search when clicking outside
document.getElementById('searchContainer').addEventListener('click', function(e) {
    if (e.target === this) {
        closeSearch();
    }
});

// ===== COURSE MODAL =====
function openCourseDetails(courseName, stats) {
    document.getElementById('modalCourseTitle').textContent = courseName;
    document.getElementById('modalEnrolled').textContent = stats.enrolled;
    document.getElementById('modalCompleted').textContent = stats.completed;
    document.getElementById('modalInProgress').textContent = stats.inProgress;
    document.getElementById('modalHalfDone').textContent = stats.halfDone;
    document.getElementById('courseModal').classList.add('active');
}

function closeCourseModal() {
    document.getElementById('courseModal').classList.remove('active');
}

// Close modal when clicking outside
document.getElementById('courseModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeCourseModal();
    }
});

// ===== OPPORTUNITY DETAILS MODAL =====
function openOpportunityDetails(title, details) {
    document.getElementById('opportunityDetailTitle').textContent = title;
    document.getElementById('opportunityDetailDuration').textContent = details.duration;
    document.getElementById('opportunityDetailStartDate').textContent = details.startDate;
    document.getElementById('opportunityDetailApplicants').textContent = details.applicants;
    document.getElementById('opportunityDetailDescription').textContent = details.description;
    document.getElementById('opportunityDetailFuture').textContent = details.futureOpportunities;
    document.getElementById('opportunityDetailPrereqs').textContent = details.prerequisites;
    
    const skillsContainer = document.getElementById('opportunityDetailSkills');
    skillsContainer.innerHTML = '';
    details.skills.forEach(skill => {
        const tag = document.createElement('span');
        tag.className = 'skill-tag';
        tag.textContent = skill;
        skillsContainer.appendChild(tag);
    });
    
    document.getElementById('opportunityDetailsModal').classList.add('active');
}

function closeOpportunityDetailsModal() {
    document.getElementById('opportunityDetailsModal').classList.remove('active');
}

function applyToOpportunity() {
    showToast('Application submitted successfully!');
    closeOpportunityDetailsModal();
}

document.getElementById('opportunityDetailsModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeOpportunityDetailsModal();
    }
});

// ===== COLLABORATOR COURSES MODAL =====
function openCollaboratorCourses(name, role) {
    document.getElementById('collaboratorName').textContent = name + "'s Submitted Courses";
    document.getElementById('collaboratorRole').textContent = 'Role: ' + role;
    document.getElementById('collaboratorCoursesModal').classList.add('active');
}

function closeCollaboratorCoursesModal() {
    document.getElementById('collaboratorCoursesModal').classList.remove('active');
}

function approveCourse(courseName) {
    showToast(courseName + ' has been approved!');
    // In a real app, you would update the course status here
}

function rejectCourse(courseName) {
    showToast(courseName + ' has been rejected.');
    // In a real app, you would update the course status here
}

function viewCourseDetails(courseName) {
    showToast('Viewing details for ' + courseName);
    // In a real app, you would open a detailed course modal
}

document.getElementById('collaboratorCoursesModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeCollaboratorCoursesModal();
    }
});

// ===== OPPORTUNITY MODAL =====
function openOpportunityModal(opportunity = null) {
    editingOpportunityId = opportunity ? opportunity.id : null;
    const form = document.getElementById('opportunityForm');
    form.reset();

    document.querySelector('#opportunityModal .modal-header h3').textContent = opportunity ? 'Edit Opportunity' : 'Add New Opportunity';
    form.querySelector('.btn-primary').textContent = opportunity ? 'Update Opportunity' : 'Create Opportunity';

    if (opportunity) {
        document.getElementById('oppName').value = opportunity.name;
        document.getElementById('oppDuration').value = opportunity.duration;
        document.getElementById('oppStartDate').value = opportunity.startDate;
        document.getElementById('oppDescription').value = opportunity.description;
        document.getElementById('oppSkills').value = opportunity.skills.join(', ');
        document.getElementById('oppCategory').value = opportunity.category;
        document.getElementById('oppFuture').value = opportunity.futureOpportunities;
        document.getElementById('oppMaxApplicants').value = opportunity.maxApplicants ?? '';
    }

    document.getElementById('opportunityModal').classList.add('active');
}

function closeOpportunityModal() {
    document.getElementById('opportunityModal').classList.remove('active');
    editingOpportunityId = null;
}

// Close modal when clicking outside
document.getElementById('opportunityModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeOpportunityModal();
    }
});

async function loadOpportunities() {
    if (!currentAdmin) return;
    const grid = document.querySelector('.opportunities-grid');
    if (grid) grid.innerHTML = '<div class="opportunity-empty">Loading opportunities...</div>';
    try {
        const data = await apiRequest('/opportunities');
        opportunities = data.opportunities || [];
        renderOpportunities();
    } catch (error) {
        if (grid) grid.innerHTML = `<div class="opportunity-empty">${escapeHtml(error.message)}</div>`;
    }
}

function renderOpportunities() {
    const grid = document.querySelector('.opportunities-grid');
    if (!grid) return;
    grid.innerHTML = '';

    if (opportunities.length === 0) {
        grid.innerHTML = '<div class="opportunity-empty">No opportunities created yet.</div>';
        return;
    }

    opportunities.forEach(opportunity => {
        const card = document.createElement('div');
        card.className = 'opportunity-card';
        const applicantsLabel = opportunity.maxApplicants ? `${opportunity.maxApplicants} maximum applicants` : 'No applicant limit';
        card.innerHTML = `
            <div class="opportunity-card-header">
                <h5>${escapeHtml(opportunity.name)}</h5>
                <div class="opportunity-meta">
                    <span><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${escapeHtml(opportunity.duration)}</span>
                    <span><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${escapeHtml(opportunity.startDate)}</span>
                    <span>${escapeHtml(categoryLabels[opportunity.category] || opportunity.category)}</span>
                </div>
            </div>
            <p class="opportunity-description">${escapeHtml(opportunity.description)}</p>
            <div class="opportunity-skills">
                <div class="opportunity-skills-label">Skills You'll Gain</div>
                <div class="skills-tags">${opportunity.skills.map(skill => `<span class="skill-tag">${escapeHtml(skill)}</span>`).join('')}</div>
            </div>
            <div class="opportunity-footer">
                <span class="applicants-count">${escapeHtml(applicantsLabel)}</span>
                <div class="opportunity-actions">
                    <button class="view-course-btn" data-action="view" style="width: auto; padding: 8px 16px;">View Details</button>
                    <button class="view-course-btn" data-action="edit" style="width: auto; padding: 8px 16px;">Edit</button>
                    <button class="view-course-btn delete-opportunity-btn" data-action="delete" style="width: auto; padding: 8px 16px;">Delete</button>
                </div>
            </div>
        `;

        card.querySelector('[data-action="view"]').addEventListener('click', () => {
            openOpportunityDetails(opportunity.name, {
                duration: opportunity.duration,
                startDate: opportunity.startDate,
                description: opportunity.description,
                skills: opportunity.skills,
                applicants: opportunity.maxApplicants ?? 'No limit',
                futureOpportunities: opportunity.futureOpportunities,
                prerequisites: categoryLabels[opportunity.category] || opportunity.category
            });
        });
        card.querySelector('[data-action="edit"]').addEventListener('click', () => openOpportunityModal(opportunity));
        card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteOpportunity(opportunity.id));
        grid.appendChild(card);
    });
}

async function deleteOpportunity(id) {
    if (!confirm('Delete this opportunity permanently?')) return;
    try {
        await apiRequest(`/opportunities/${id}`, { method: 'DELETE' });
        opportunities = opportunities.filter(opportunity => opportunity.id !== id);
        renderOpportunities();
        showToast('Opportunity deleted successfully');
    } catch (error) {
        showToast(error.message);
    }
}

document.getElementById('opportunityForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const payload = {
        name: document.getElementById('oppName').value.trim(),
        duration: document.getElementById('oppDuration').value.trim(),
        startDate: document.getElementById('oppStartDate').value,
        description: document.getElementById('oppDescription').value.trim(),
        skills: document.getElementById('oppSkills').value.split(',').map(s => s.trim()).filter(Boolean),
        category: document.getElementById('oppCategory').value,
        futureOpportunities: document.getElementById('oppFuture').value.trim(),
        maxApplicants: document.getElementById('oppMaxApplicants').value.trim()
    };

    if (!payload.name || !payload.duration || !payload.startDate || !payload.description || payload.skills.length === 0 || !payload.category || !payload.futureOpportunities) {
        showToast('Please fill all required fields');
        return;
    }

    try {
        const path = editingOpportunityId ? `/opportunities/${editingOpportunityId}` : '/opportunities';
        const method = editingOpportunityId ? 'PUT' : 'POST';
        const data = await apiRequest(path, { method, body: JSON.stringify(payload) });
        if (editingOpportunityId) {
            opportunities = opportunities.map(opportunity => opportunity.id === data.opportunity.id ? data.opportunity : opportunity);
            showToast('Opportunity updated successfully!');
        } else {
            opportunities.unshift(data.opportunity);
            showToast('Opportunity created successfully!');
        }
        renderOpportunities();
        closeOpportunityModal();
        this.reset();
    } catch (error) {
        showToast(error.message);
    }
});

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ===== QUICK ADD STUDENT MODAL =====
function openQuickAddModal() {
    document.getElementById('quickAddModal').classList.add('active');
}

function closeQuickAddModal() {
    document.getElementById('quickAddModal').classList.remove('active');
}

document.getElementById('quickAddModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeQuickAddModal();
    }
});

document.getElementById('quickAddForm').addEventListener('submit', function(e) {
    e.preventDefault();
    showToast('Student added successfully! Email invitation sent.');
    closeQuickAddModal();
    this.reset();
});

// ===== BULK UPLOAD MODAL =====
function openBulkUploadModal() {
    document.getElementById('bulkUploadModal').classList.add('active');
}

function closeBulkUploadModal() {
    document.getElementById('bulkUploadModal').classList.remove('active');
}

document.getElementById('bulkUploadModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeBulkUploadModal();
    }
});

document.getElementById('bulkUploadForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const fileInput = document.getElementById('csvFileInput');
    if (fileInput.files.length === 0) {
        showToast('Please select a CSV file');
        return;
    }
    showToast('Students uploaded successfully! Email invitations sent.');
    closeBulkUploadModal();
    this.reset();
    document.getElementById('fileName').textContent = '';
});

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        document.getElementById('fileName').textContent = '✓ Selected: ' + file.name;
    }
}

function downloadSampleCSV() {
    const csvContent = 'First Name,Last Name,Email\nJohn,Doe,john.doe@example.com\nJane,Smith,jane.smith@example.com';
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample_students.csv';
    a.click();
    window.URL.revokeObjectURL(url);
}

// ===== QUICK ADD VERIFIER MODAL =====
function openQuickAddVerifierModal() {
    document.getElementById('quickAddVerifierModal').classList.add('active');
}

function closeQuickAddVerifierModal() {
    document.getElementById('quickAddVerifierModal').classList.remove('active');
}

document.getElementById('quickAddVerifierModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeQuickAddVerifierModal();
    }
});

document.getElementById('quickAddVerifierForm').addEventListener('submit', function(e) {
    e.preventDefault();
    showToast('Verifier added successfully! Email invitation sent.');
    closeQuickAddVerifierModal();
    this.reset();
});

// ===== BULK UPLOAD VERIFIER MODAL =====
function openBulkUploadVerifierModal() {
    document.getElementById('bulkUploadVerifierModal').classList.add('active');
}

function closeBulkUploadVerifierModal() {
    document.getElementById('bulkUploadVerifierModal').classList.remove('active');
}

document.getElementById('bulkUploadVerifierModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeBulkUploadVerifierModal();
    }
});

document.getElementById('bulkUploadVerifierForm').addEventListener('submit', function(e) {
    e.preventDefault();
    const fileInput = document.getElementById('csvVerifierFileInput');
    if (fileInput.files.length === 0) {
        showToast('Please select a CSV file');
        return;
    }
    showToast('Verifiers uploaded successfully! Email invitations sent.');
    closeBulkUploadVerifierModal();
    this.reset();
    document.getElementById('verifierFileName').textContent = '';
});

function handleVerifierFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        document.getElementById('verifierFileName').textContent = '✓ Selected: ' + file.name;
    }
}

function downloadSampleVerifierCSV() {
    const csvContent = 'First Name,Last Name,Email,Subject\nDr. John,Doe,john.doe@qf.edu.qa,Mathematics\nProf. Jane,Smith,jane.smith@qf.edu.qa,Physics';
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample_verifiers.csv';
    a.click();
    window.URL.revokeObjectURL(url);
}

// ===== VERIFIER DETAILS MODAL =====
function openVerifierDetails(name, stats) {
    document.getElementById('verifierName').textContent = name;
    document.getElementById('verifierTotalStudents').textContent = stats.totalStudents;
    document.getElementById('verifierCertified').textContent = stats.certified;
    document.getElementById('verifierInProgress').textContent = stats.inProgress;
    
    // Populate subjects
    const container = document.getElementById('subjectsContainer');
    container.innerHTML = '';
    stats.subjects.forEach(subject => {
        const div = document.createElement('div');
        div.className = 'subject-item';
        div.innerHTML = `
            <span class="subject-name">${subject.name}</span>
            <span class="subject-students">${subject.students} students</span>
        `;
        container.appendChild(div);
    });
    
    document.getElementById('verifierDetailsModal').classList.add('active');
}

function closeVerifierDetailsModal() {
    document.getElementById('verifierDetailsModal').classList.remove('active');
}

document.getElementById('verifierDetailsModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeVerifierDetailsModal();
    }
});

// ===== STUDENT FILTERS =====
function filterStudents() {
    const statusFilter = document.getElementById('statusFilter').value;
    const dateFrom = document.getElementById('dateFrom').value;
    const dateTo = document.getElementById('dateTo').value;
    
    const rows = document.querySelectorAll('#studentsTableBody tr');
    
    rows.forEach(row => {
        const rowStatus = row.getAttribute('data-status');
        let showRow = true;
        
        // Status filter
        if (statusFilter !== 'all' && rowStatus !== statusFilter) {
            showRow = false;
        }
        
        // Date filters would be implemented here with actual date data
        
        row.style.display = showRow ? '' : 'none';
    });
}

// ===== VERIFIER FILTERS =====
function filterVerifiers() {
    const statusFilter = document.getElementById('verifierStatusFilter').value;
    const dateFrom = document.getElementById('verifierDateFrom').value;
    const dateTo = document.getElementById('verifierDateTo').value;
    
    const rows = document.querySelectorAll('#verifiersTableBody tr');
    
    rows.forEach(row => {
        const rowStatus = row.getAttribute('data-status');
        let showRow = true;
        
        // Status filter
        if (statusFilter !== 'all' && rowStatus !== statusFilter) {
            showRow = false;
        }
        
        // Date filters would be implemented here with actual date data
        
        row.style.display = showRow ? '' : 'none';
    });
}

// ===== LOGIN =====
document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    clearAllErrors('loginForm');
    let valid = true;
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    const captchaInput = document.getElementById('loginCaptchaInput').value.trim();
    const remember = document.querySelector('.remember-me input').checked;

    if (!email || !isValidEmail(email)) { showError('loginEmailErr'); document.getElementById('loginEmail').classList.add('error'); valid = false; }
    if (!password) { showError('loginPasswordErr','Please enter your password'); document.getElementById('loginPassword').classList.add('error'); valid = false; }
    if (!captchaInput) { showError('loginCaptchaErr','Please enter the captcha code'); valid = false; }
    else if (captchaInput !== captchas.login) { showError('loginCaptchaErr','Captcha does not match. Please try again.'); valid = false; generateCaptcha('login'); }

    if (!valid) { shakeForm('loginForm'); return; }

    try {
        const data = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password, remember })
        });
        showToast('Login successful! Redirecting...');
        setTimeout(() => showDashboard(data.admin), 800);
        generateCaptcha('login');
    } catch (error) {
        showError('loginPasswordErr', 'Invalid email or password');
        document.getElementById('loginPassword').classList.add('error');
        shakeForm('loginForm');
        generateCaptcha('login');
    }
});

// ===== SIGNUP =====
document.getElementById('signupForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    clearAllErrors('signupForm');
    let valid = true;
    const name = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value.trim();
    const confirmPassword = document.getElementById('signupConfirmPassword').value.trim();
    const captchaInput = document.getElementById('signupCaptchaInput').value.trim();

    if (!name) { showError('signupNameErr'); document.getElementById('signupName').classList.add('error'); valid = false; }
    if (!email || !isValidEmail(email)) { showError('signupEmailErr'); document.getElementById('signupEmail').classList.add('error'); valid = false; }
    if (!password || password.length < 8) { showError('signupPasswordErr'); document.getElementById('signupPassword').classList.add('error'); valid = false; }
    if (!confirmPassword || password !== confirmPassword) { showError('signupConfirmPasswordErr'); document.getElementById('signupConfirmPassword').classList.add('error'); valid = false; }
    if (!captchaInput) { showError('signupCaptchaErr','Please enter the captcha code'); valid = false; }
    else if (captchaInput !== captchas.signup) { showError('signupCaptchaErr','Captcha does not match.'); valid = false; generateCaptcha('signup'); }

    if (!valid) { shakeForm('signupForm'); return; }
    try {
        await apiRequest('/auth/signup', {
            method: 'POST',
            body: JSON.stringify({ fullName: name, email, password, confirmPassword })
        });
        showToast('Account created successfully!');
        generateCaptcha('signup');
        this.reset(); checkStrength('');
        setTimeout(() => showPage('loginPage'), 1200);
    } catch (error) {
        showError('signupEmailErr', error.message);
        document.getElementById('signupEmail').classList.add('error');
        shakeForm('signupForm');
    }
});

// ===== FORGOT =====
document.getElementById('forgotForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    clearAllErrors('forgotForm');
    let valid = true;
    const email = document.getElementById('forgotEmail').value.trim();
    const captchaInput = document.getElementById('forgotCaptchaInput').value.trim();

    if (!email || !isValidEmail(email)) { showError('forgotEmailErr'); document.getElementById('forgotEmail').classList.add('error'); valid = false; }
    if (!captchaInput) { showError('forgotCaptchaErr','Please enter the captcha code'); valid = false; }
    else if (captchaInput !== captchas.forgot) { showError('forgotCaptchaErr','Captcha does not match.'); valid = false; generateCaptcha('forgot'); }

    if (!valid) { shakeForm('forgotForm'); return; }
    try {
        const data = await apiRequest('/auth/forgot-password', {
            method: 'POST',
            body: JSON.stringify({ email })
        });
        showToast(data.message);
        generateCaptcha('forgot');
        this.reset();
    } catch (error) {
        showToast(error.message);
        generateCaptcha('forgot');
    }
});

// Clear errors on input
document.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', function() {
        this.classList.remove('error');
        const err = this.closest('.form-group')?.querySelector('.error-msg');
        if (err) err.classList.remove('show');
    });
});

// Responsive sidebar
window.addEventListener('resize', () => {
    const toggle = document.getElementById('menuToggle');
    if (toggle) toggle.style.display = window.innerWidth <= 768 ? 'flex' : 'none';
});

document.addEventListener('DOMContentLoaded', async () => {
    const grid = document.querySelector('.opportunities-grid');
    if (grid) grid.innerHTML = '<div class="opportunity-empty">Sign in to view your opportunities.</div>';
    try {
        const data = await apiRequest('/auth/me');
        showDashboard(data.admin);
    } catch (error) {
        currentAdmin = null;
    }
});
