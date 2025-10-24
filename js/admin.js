import { auth, db } from './firebase-config.js';
import { 
    createUserWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
import { 
    doc, 
    getDoc, 
    collection, 
    query, 
    where, 
    getDocs, 
    setDoc, 
    updateDoc 
} from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

// Global cache for reference data
let allUsers = [];
let allClasses = [];
let allCourses = [];

const COURSE_DOC_ID = "main-course-1"; // Assuming a default course ID for simplicity

// --- 1. Initialization and Data Fetching ---

/** Fetches all necessary reference data (users, classes, courses) on page load. */
async function fetchReferenceData() {
    try {
        // Fetch All Users
        const usersSnap = await getDocs(collection(db, "users"));
        allUsers = usersSnap.docs.map(d => ({ uid: d.id, ...d.data() }));

        // Fetch All Classes
        const classesSnap = await getDocs(collection(db, "classes"));
        allClasses = classesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Fetch All Courses
        const coursesSnap = await getDocs(collection(db, "courses"));
        allCourses = coursesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Populate dropdowns
        populateDropdowns();
    } catch (error) {
        console.error("Error fetching reference data:", error);
        alert("Failed to load initial data. Check console and security rules.");
    }
}

/** Populates dropdowns (select elements) with fetched data. */
function populateDropdowns() {
    const teacherUsers = allUsers.filter(u => u.role === 'teacher');
    const studentClasses = allClasses;

    // Populate Teacher Selects (for Class/Course creation, and Report Filter)
    const teacherSelects = document.querySelectorAll('#class-teacher-id, #course-teacher-id, #report-filter-teacher');
    teacherSelects.forEach(select => {
        select.innerHTML = select.id.includes('filter') 
            ? '<option value="all">Filter by Teacher</option>' 
            : '<option value="">Select Teacher</option>';
        teacherUsers.forEach(t => {
            select.innerHTML += `<option value="${t.uid}">${t.email}</option>`;
        });
    });

    // Populate Class Selects (for Student creation and Report Filter)
    const classSelects = document.querySelectorAll('#user-class-id, #report-filter-class');
    classSelects.forEach(select => {
        select.innerHTML = select.id.includes('filter') 
            ? '<option value="all">Filter by Class</option>' 
            : '<option value="">Select Class</option>';
        studentClasses.forEach(c => {
            select.innerHTML += `<option value="${c.id}">${c.name} (${c.id})</option>`;
        });
    });

    // Enable/Disable class select based on role
    document.getElementById('new-user-role').addEventListener('change', (e) => {
        const classSelect = document.getElementById('user-class-id');
        classSelect.disabled = e.target.value !== 'student';
        classSelect.value = '';
    });
    
    renderExistingCourses();
}

/** Renders the list of existing courses for informational purposes. */
function renderExistingCourses() {
    const listEl = document.getElementById('existing-courses-list');
    if (allCourses.length === 0) {
        listEl.innerHTML = '<p>No courses created yet.</p>';
        return;
    }

    listEl.innerHTML = allCourses.map(course => {
        const teacher = allUsers.find(u => u.uid === course.teacherId)?.email || 'Unassigned';
        return `<p><strong>${course.title}</strong> (ID: ${course.id}) - Owner: ${teacher}</p>`;
    }).join('');
}


// --- 2. Administrative CRUD Functions (Window Scope for HTML Calls) ---

/** Creates a new user (Teacher/Student/Admin) via Firebase Auth and Firestore. */
window.createUser = async function() {
    const email = document.getElementById('new-user-email').value;
    const password = document.getElementById('new-user-password').value;
    const role = document.getElementById('new-user-role').value;
    const classId = document.getElementById('user-class-id').value;

    if (!email || !password || !role) return alert("Fill in all required user fields.");
    if (role === 'student' && !classId) return alert("Student must be assigned a class.");
    
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const userData = {
            email: email,
            role: role,
        };
        if (role === 'student') {
            userData.classId = classId;
        }

        await setDoc(doc(db, "users", userCredential.user.uid), userData);
        
        alert(`Successfully created ${role} user: ${email}`);
        await fetchReferenceData(); // Refresh data
    } catch (error) {
        alert('User creation failed: ' + error.message);
        console.error(error);
    }
}

/** Creates a new class document and assigns a teacher to it. */
window.createClass = async function() {
    const id = document.getElementById('new-class-id').value.trim();
    const teacherId = document.getElementById('class-teacher-id').value;
    
    if (!id || !teacherId) return alert("Class ID and Teacher must be selected.");

    try {
        // Use the ID as the document ID
        await setDoc(doc(db, "classes", id), {
            id: id,
            name: id, // Use ID as name for simplicity, could be enhanced
            teacherId: teacherId
        });
        
        alert(`Class ${id} created and assigned to teacher.`);
        document.getElementById('new-class-id').value = '';
        await fetchReferenceData(); // Refresh data
    } catch (error) {
        alert('Class creation failed. Ensure ID is unique and valid: ' + error.message);
        console.error(error);
    }
}

/** Creates a new course document and assigns an owning teacher. */
window.createCourse = async function() {
    const id = document.getElementById('new-course-id').value.trim();
    const title = document.getElementById('new-course-title').value;
    const teacherId = document.getElementById('course-teacher-id').value;
    
    if (!id || !title || !teacherId) return alert("Fill in all course fields.");

    try {
        // Use the ID as the document ID
        await setDoc(doc(db, "courses", id), {
            id: id,
            title: title,
            teacherId: teacherId,
            topics: {} // Initialize with an empty topics map
        });
        
        alert(`Course "${title}" created.`);
        document.getElementById('new-course-id').value = '';
        document.getElementById('new-course-title').value = '';
        await fetchReferenceData(); // Refresh data
    } catch (error) {
        alert('Course creation failed. Ensure ID is unique and valid: ' + error.message);
        console.error(error);
    }
}


// --- 3. Global Reporting ---

window.renderGlobalReport = async function() {
    const teacherFilter = document.getElementById('report-filter-teacher').value;
    const classFilter = document.getElementById('report-filter-class').value;
    const reportDataEl = document.getElementById('global-report-data');
    reportDataEl.innerHTML = '<p>Generating report...</p>';

    try {
        // Fetch all progress data
        const progressSnap = await getDocs(collection(db, "progress"));
        const progressMap = {}; // Key: studentUID_videoId -> data
        progressSnap.docs.forEach(doc => {
            const data = doc.data();
            progressMap[`${data.userId}_${data.videoId}`] = data;
        });

        const students = allUsers.filter(u => 
            u.role === 'student' && 
            (classFilter === 'all' || u.classId === classFilter)
        );

        const coursesWithTeacher = allCourses.filter(c => 
            teacherFilter === 'all' || c.teacherId === teacherFilter
        );
        
        if (students.length === 0 || coursesWithTeacher.length === 0) {
            return reportDataEl.innerHTML = '<p>No matching students or courses found based on filters.</p>';
        }

        let reportHTML = '<h3>Detailed Progress</h3>';

        coursesWithTeacher.forEach(course => {
            const teacher = allUsers.find(u => u.uid === course.teacherId)?.email || 'N/A';
            reportHTML += `<h4>Course: ${course.title} (Teacher: ${teacher})</h4>`;

            // Extract all unique videos from this course
            const courseVideos = [];
            Object.values(course.topics || {}).forEach(topic => {
                courseVideos.push(...topic.videos.map(v => v.id));
            });
            
            if (courseVideos.length === 0) {
                 reportHTML += `<p>No videos configured for this course.</p>`;
                 return;
            }

            // Group students by class for better viewing
            const studentsByClass = students.reduce((acc, student) => {
                const className = student.classId || 'Unassigned';
                acc[className] = acc[className] || [];
                acc[className].push(student);
                return acc;
            }, {});

            Object.entries(studentsByClass).forEach(([className, studentList]) => {
                reportHTML += `<h5>Class: ${className}</h5>`;
                
                let tableHeader = `<th>Student Email</th>`;
                courseVideos.forEach(vidId => {
                    tableHeader += `<th>${vidId} (%) / Views</th>`;
                });

                let tableBody = studentList.map(student => {
                    let row = `<tr><td>${student.email}</td>`;
                    courseVideos.forEach(vidId => {
                        const progress = progressMap[`${student.uid}_${vidId}`];
                        const text = progress 
                            ? `${progress.completionPercentage || 0}% / x${progress.watchCount || 0}` 
                            : '0% / x0';
                        row += `<td>${text}</td>`;
                    });
                    row += `</tr>`;
                    return row;
                }).join('');

                reportHTML += `
                    <table>
                        <thead><tr>${tableHeader}</tr></thead>
                        <tbody>${tableBody}</tbody>
                    </table><br>`;
            });
        });

        reportDataEl.innerHTML = reportHTML;
    } catch (error) {
        console.error("Error generating report:", error);
        reportDataEl.innerHTML = `<p style="color:red;">Error generating report: ${error.message}</p>`;
    }
}

// --- Initial Setup ---
// Run initial data fetch and population when the script loads
auth.onAuthStateChanged(user => {
    if (user) {
        fetchReferenceData();
    }
});
