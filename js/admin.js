import {
    auth,
    db,
    collection,
    doc,
    addDoc,
    setDoc,
    getDocs,
    query,
    where,
    onAuthStateChanged
} from './firebase-config.js';

document.addEventListener('DOMContentLoaded', () => {
    // Wait for auth to be ready
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // User is signed in and is an admin (verified by auth.js)
            initAdminPage();
        }
    });
});

/**
 * Main function to initialize all admin page functionality
 */
function initAdminPage() {
    console.log("Admin page initialized");
    setupNavLinks();
    populateTeacherDropdowns();
    populateClassDropdowns();
    setupFormListeners();
    setupReportListeners();

    // Show/hide class assignment dropdown based on role
    document.getElementById('user-role').addEventListener('change', (e) => {
        const classAssignmentEl = document.getElementById('student-class-assignment');
        classAssignmentEl.style.display = (e.target.value === 'student') ? 'block' : 'none';
    });
}

/**
 * Sets up the tabbed navigation
 */
function setupNavLinks() {
    const navLinks = document.querySelectorAll('.sidebar .nav-link');
    const contentSections = document.querySelectorAll('.content-section');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('data-target');

            // Update active link
            navLinks.forEach(nav => nav.classList.remove('active'));
            link.classList.add('active');

            // Show target section, hide others
            contentSections.forEach(section => {
                section.style.display = (section.id === targetId) ? 'block' : 'none';
            });
        });
    });
}

/**
 * Fetches all users with role 'teacher' and populates select dropdowns
 */
async function populateTeacherDropdowns() {
    const teacherQuery = query(collection(db, 'users'), where('role', '==', 'teacher'));
    const querySnapshot = await getDocs(teacherQuery);
    
    const teacherSelects = [
        document.getElementById('class-teacher'),
        document.getElementById('course-teacher'),
        document.getElementById('filter-teacher')
    ];

    teacherSelects.forEach(select => {
        if (!select) return;
        // Clear existing options (except for filter's 'All Teachers' option)
        if (select.id === 'filter-teacher') {
             select.innerHTML = '<option value="">All Teachers</option>';
        } else {
             select.innerHTML = '<option value="">Select a Teacher</option>';
        }
       
        querySnapshot.forEach((doc) => {
            const teacher = doc.data();
            const option = document.createElement('option');
            option.value = doc.id; // Teacher's UID
            option.textContent = teacher.email;
            select.appendChild(option);
        });
    });
}

/**
 * Fetches all classes and populates select dropdowns
 */
async function populateClassDropdowns() {
    const classQuery = query(collection(db, 'classes'));
    const querySnapshot = await getDocs(classQuery);

    const classSelects = [
        document.getElementById('user-class'),
        document.getElementById('filter-class')
    ];

    classSelects.forEach(select => {
        if (!select) return;

        if (select.id === 'filter-class') {
            select.innerHTML = '<option value="">All Classes</option>';
        } else {
            select.innerHTML = '<option value="">Select a Class</option>';
        }
        
        querySnapshot.forEach((doc) => {
            const classData = doc.data();
            const option = document.createElement('option');
            option.value = doc.id; // Class ID
            option.textContent = classData.name;
            select.appendChild(option);
        });
    });

    // Handle dynamic class filtering based on teacher filter
    document.getElementById('filter-teacher').addEventListener('change', async (e) => {
        const teacherId = e.target.value;
        const classFilterSelect = document.getElementById('filter-class');
        classFilterSelect.innerHTML = '<option value="">All Classes</option>'; // Reset

        if (teacherId) {
            const q = query(collection(db, 'classes'), where('teacherId', '==', teacherId));
            const classSnap = await getDocs(q);
            classSnap.forEach((doc) => {
                const option = document.createElement('option');
                option.value = doc.id;
                option.textContent = doc.data().name;
                classFilterSelect.appendChild(option);
            });
        } else {
            // If 'All Teachers' is selected, re-populate with all classes
            populateClassDropdowns(); 
        }
    });
}


/**
 * Attaches submit listeners to all admin forms
 */
function setupFormListeners() {
    // --- Create User ---
    document.getElementById('create-user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const uid = document.getElementById('user-uid').value;
        const email = document.getElementById('user-email').value;
        const role = document.getElementById('user-role').value;
        const classId = document.getElementById('user-class').value;

        if (!uid || !email || !role) {
            alert('Please fill out UID, Email, and Role.');
            return;
        }

        try {
            const userDocRef = doc(db, 'users', uid);
            await setDoc(userDocRef, {
                email: email,
                role: role,
                classId: (role === 'student') ? classId : null
            });
            alert('User created successfully in Firestore!');
            e.target.reset();
        } catch (error) {
            console.error("Error creating user document: ", error);
            alert('Error creating user. Check console.');
        }
    });

    // --- Create Class ---
    document.getElementById('create-class-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('class-name').value;
        const teacherId = document.getElementById('class-teacher').value;

        if (!name || !teacherId) {
            alert('Please fill out all fields.');
            return;
        }
        
        try {
            await addDoc(collection(db, 'classes'), {
                name: name,
                teacherId: teacherId
            });
            alert('Class created successfully!');
            e.target.reset();
            populateClassDropdowns(); // Refresh class lists
        } catch (error) {
            console.error("Error creating class: ", error);
            alert('Error creating class. Check console.');
        }
    });

    // --- Create Course ---
    document.getElementById('create-course-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('course-title').value;
        const teacherId = document.getElementById('course-teacher').value;

        if (!title || !teacherId) {
            alert('Please fill out all fields.');
            return;
        }

        try {
            await addDoc(collection(db, 'courses'), {
                title: title,
                teacherId: teacherId,
                topics: {} // Initialize topics as an empty map
            });
            alert('Course created successfully!');
            e.target.reset();
        } catch (error) {
            console.error("Error creating course: ", error);
            alert('Error creating course. Check console.');
        }
    });
}

/**
 * Sets up listener for the 'Run Report' button
 */
function setupReportListeners() {
    document.getElementById('run-report-btn').addEventListener('click', generateGlobalReport);
}

/**
 * Fetches data and generates the global progress report
 */
async function generateGlobalReport() {
    const reportOutput = document.getElementById('report-output');
    reportOutput.innerHTML = 'Generating report...';

    const selectedTeacherId = document.getElementById('filter-teacher').value;
    const selectedClassId = document.getElementById('filter-class').value;

    try {
        // 1. Create a map of all Video IDs to Video Titles
        const videoIdTitleMap = new Map();
        const coursesSnap = await getDocs(collection(db, 'courses'));
        coursesSnap.forEach(courseDoc => {
            const topics = courseDoc.data().topics;
            for (const topicName in topics) {
                topics[topicName].forEach(video => {
                    videoIdTitleMap.set(video.videoId, video.title);
                });
            }
        });

        // 2. Build student query based on filters
        let studentQuery = collection(db, 'users');
        const constraints = [where('role', '==', 'student')];

        if (selectedClassId) {
            constraints.push(where('classId', '==', selectedClassId));
        } else if (selectedTeacherId) {
            // If teacher is selected but class isn't, find all classes for that teacher
            const teacherClassesQuery = query(collection(db, 'classes'), where('teacherId', '==', selectedTeacherId));
            const teacherClassesSnap = await getDocs(teacherClassesQuery);
            const classIds = teacherClassesSnap.docs.map(d => d.id);
            
            if (classIds.length > 0) {
                 // Firestore 'in' query supports up to 30 values
                constraints.push(where('classId', 'in', classIds));
            } else {
                reportOutput.innerHTML = 'This teacher has no classes.';
                return;
            }
        }
        
        studentQuery = query(studentQuery, ...constraints);
        const studentsSnap = await getDocs(studentQuery);

        if (studentsSnap.empty) {
            reportOutput.innerHTML = 'No students found matching criteria.';
            return;
        }

        // 3. For each student, get their progress
        let htmlOutput = '';
        for (const studentDoc of studentsSnap.docs) {
            const student = studentDoc.data();
            htmlOutput += `<div class="report-student-group"><h4>${student.email} (UID: ${studentDoc.id})</h4>`;

            const progressQuery = query(collection(db, 'progress'), where('userId', '==', studentDoc.id));
            const progressSnap = await getDocs(progressQuery);

            if (progressSnap.empty) {
                htmlOutput += '<ul><li>No progress recorded.</li></ul></div>';
                continue;
            }

            htmlOutput += '<ul>';
            progressSnap.forEach(progressDoc => {
                const data = progressDoc.data();
                const title = videoIdTitleMap.get(data.videoId) || `Unknown Video (${data.videoId})`;
                htmlOutput += `
                    <li>
                        <strong>${title}</strong>: 
                        ${data.completionPercentage || 0}% Complete | 
                        ${data.watchCount || 0} Views | 
                        ${data.watchTime || 0}s Watched
                    </li>
                `;
            });
            htmlOutput += '</ul></div>';
        }

        reportOutput.innerHTML = htmlOutput;

    } catch (error) {
        console.error("Error generating report: ", error);
        reportOutput.innerHTML = 'Error generating report. Check console.';
    }
}
