import { auth, db } from './firebase-config.js';
import { doc, getDoc, collection, getDocs, setDoc, updateDoc, arrayUnion, arrayRemove, query, where, deleteDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

const COURSE_DOC_REF = doc(db, "courses", "main-course");
let studentsData = []; // Cache student data for assignments

// --- Content Management (CRUD) ---

window.addTopic = async function() {
    const title = document.getElementById('new-topic-title').value;
    if (!title) return alert("Title is required.");

    const topicId = 'topic-' + Date.now();
    try {
        await updateDoc(COURSE_DOC_REF, {
            [`topics.${topicId}`]: {
                title: title,
                order: Date.now(),
                videos: []
            }
        }, { merge: true });
        document.getElementById('new-topic-title').value = '';
        renderCourseStructure();
    } catch (e) {
        alert("Error adding topic. Ensure main-course document exists.");
        console.error(e);
    }
}

window.addVideoToTopic = async function(topicId) {
    const videoTitle = prompt("Enter Video Title:");
    const youtubeId = prompt("Enter YouTube Video ID (e.g., 'dQw4w9WgXcQ'):");
    if (!videoTitle || !youtubeId) return;

    const videoId = 'vid-' + Date.now();
    
    // We must read the document, update the specific array, and write it back
    try {
        await runTransaction(db, async (transaction) => {
            const courseSnap = await transaction.get(COURSE_DOC_REF);
            const courseData = courseSnap.data();
            const topic = courseData.topics[topicId];

            topic.videos.push({
                id: videoId,
                title: videoTitle,
                youtubeId: youtubeId
            });

            transaction.update(COURSE_DOC_REF, {
                [`topics.${topicId}`]: topic
            });
        });
        renderCourseStructure();
    } catch (e) {
        console.error("Error adding video:", e);
        alert("Error adding video. See console.");
    }
}

// --- Assignment Management ---

async function fetchStudentsAndClasses() {
    const usersSnap = await getDocs(query(collection(db, "users"), where("role", "==", "student")));
    studentsData = usersSnap.docs.map(d => ({ uid: d.id, ...d.data() }));

    const classIds = [...new Set(studentsData.map(s => s.classId).filter(c => c))];
    
    const studentListContainer = document.getElementById('student-list-container');
    studentListContainer.innerHTML = '<h4>Assign to Classes:</h4>';
    
    classIds.forEach(id => {
        studentListContainer.innerHTML += `
            <div>
                <input type="checkbox" id="class-${id}" value="${id}">
                <label for="class-${id}">${id}</label>
            </div>`;
    });

    studentListContainer.innerHTML += '<h4>Assign to Individual Students:</h4>';
    studentsData.forEach(student => {
        studentListContainer.innerHTML += `
            <div>
                <input type="checkbox" id="student-${student.uid}" value="${student.uid}">
                <label for="student-${student.uid}">${student.email} (${student.classId})</label>
            </div>`;
    });
}

window.saveAssignments = async function() {
    const contentRef = document.getElementById('content-to-assign').value;
    if (!contentRef) return alert("Please select content to assign.");

    const checkboxes = document.querySelectorAll('#student-list-container input[type="checkbox"]:checked');
    const newAssignments = [];
    
    if (checkboxes.length === 0) return alert("Select at least one student or class.");

    try {
        // Simple assignment: delete existing assignments for this content, then recreate
        const oldAssignments = await getDocs(query(collection(db, "assignments"), where("contentRef", "==", contentRef)));
        oldAssignments.docs.forEach(async (doc) => {
            await deleteDoc(doc.ref);
        });

        for (const checkbox of checkboxes) {
            const isClass = checkbox.id.startsWith('class-');
            const type = isClass ? 'class' : 'student';

            await setDoc(doc(collection(db, "assignments")), {
                contentRef: contentRef,
                contentType: contentRef.startsWith('vid-') ? 'video' : 'topic',
                assignedToType: type,
                assignedToId: checkbox.value,
                assignedBy: auth.currentUser.uid,
                timestamp: new Date()
            });
        }
        alert(`Assignments saved for ${contentRef}!`);
    } catch (e) {
        console.error("Error saving assignments:", e);
        alert("Error saving assignments. Check console.");
    }
}

// --- Rendering Functions ---

async function renderCourseStructure() {
    const courseSnap = await getDoc(COURSE_DOC_REF);
    const courseData = courseSnap.data();
    const courseView = document.getElementById('course-structure-view');
    const assignmentSelect = document.getElementById('content-to-assign');
    courseView.innerHTML = '';
    assignmentSelect.innerHTML = '<option value="">Select Video/Topic</option>';

    if (!courseData || !courseData.topics) return courseView.innerHTML = '<p>No content. Click "Add New Topic" to start.</p>';
    
    const sortedTopics = Object.entries(courseData.topics).sort(([, a], [, b]) => (a.order || 0) - (b.order || 0));

    sortedTopics.forEach(([topicId, topic]) => {
        // Render Topic
        const topicEl = document.createElement('div');
        topicEl.className = 'topic-item';
        topicEl.innerHTML = `
            <h4>${topic.title} 
                <button onclick="addVideoToTopic('${topicId}')">Add Video</button>
            </h4>
        `;
        courseView.appendChild(topicEl);
        
        // Add Topic to Assignment Select (Optional)
        // assignmentSelect.innerHTML += `<option value="${topicId}">Topic: ${topic.title}</option>`;

        // Render Videos
        topic.videos.forEach(video => {
            const videoEl = document.createElement('p');
            videoEl.className = 'video-item';
            videoEl.textContent = `-> ${video.title} (ID: ${video.id}, YT: ${video.youtubeId})`;
            topicEl.appendChild(videoEl);

            // Add Video to Assignment Select
            assignmentSelect.innerHTML += `<option value="${video.id}">Video: ${video.title}</option>`;
        });
    });
}

async function renderProgressMonitoring() {
    const progressRef = collection(db, "progress");
    const progressSnap = await getDocs(progressRef);
    const progressMap = {}; // Map: studentUID -> { videoId: progressData }
    const videoList = new Set();
    
    progressSnap.docs.forEach(doc => {
        const data = doc.data();
        if (!progressMap[data.userId]) {
            progressMap[data.userId] = {};
        }
        progressMap[data.userId][data.videoId] = data;
        videoList.add(data.videoId);
    });

    const progressDataEl = document.getElementById('progress-data');
    if (studentsData.length === 0) return progressDataEl.innerHTML = '<p>No students found.</p>';

    const header = `<th>Student Email</th><th>Class ID</th>` + 
                   Array.from(videoList).map(id => `<th>${id} Progress</th>`).join('');
    
    const body = studentsData.map(student => {
        let row = `<tr><td>${student.email}</td><td>${student.classId}</td>`;
        Array.from(videoList).forEach(videoId => {
            const prog = progressMap[student.uid]?.[videoId];
            const text = prog 
                ? `${prog.completionPercentage}% (x${prog.watchCount || 0})` 
                : 'N/A';
            row += `<td>${text}</td>`;
        });
        row += `</tr>`;
        return row;
    }).join('');

    progressDataEl.innerHTML = `
        <table>
            <thead><tr>${header}</tr></thead>
            <tbody>${body}</tbody>
        </table>
    `;
}

// Initial Load
onAuthStateChanged(auth, async (user) => {
    if (user) {
        await renderCourseStructure();
        await fetchStudentsAndClasses();
        await renderProgressMonitoring();
    }
});
