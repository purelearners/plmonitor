import {
    auth,
    db,
    collection,
    doc,
    addDoc,
    getDoc,
    getDocs,
    updateDoc,
    query,
    where,
    arrayUnion,
    onAuthStateChanged
} from './firebase-config.js';

let currentTeacherId = null;
let allCourses = []; // Cache for all courses
let myStudents = []; // Cache for teacher's students
let myClasses = []; // Cache for teacher's classes

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentTeacherId = user.uid;
            initTeacherPage();
        }
    });
});

/**
 * Main function to initialize all teacher page functionality
 */
async function initTeacherPage() {
    console.log("Teacher page initialized for user:", currentTeacherId);
    setupNavLinks();
    
    // Fetch all data needed for the dashboard
    await fetchTeacherData();

    // Populate UI elements
    populateCourseDropdowns();
    populateAssignmentStudents();
    
    // Set up listeners
    setupContentManagementListeners();
    setupAssignmentListeners();
    setupBulkUploadListener(); // <-- NEW

    // Load initial report
    generateTeacherReport();
}

/**
 * Fetches all data related to this teacher (courses, classes, students)
 */
async function fetchTeacherData() {
    if (!currentTeacherId) return;

    // 1. Fetch my courses
    const coursesQuery = query(collection(db, 'courses'), where('teacherId', '==', currentTeacherId));
    const coursesSnap = await getDocs(coursesQuery);
    allCourses = coursesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 2. Fetch my classes
    const classesQuery = query(collection(db, 'classes'), where('teacherId', '==', currentTeacherId));
    const classesSnap = await getDocs(classesQuery);
    myClasses = classesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const classIds = myClasses.map(c => c.id);

    // 3. Fetch my students (from my classes)
    if (classIds.length > 0) {
        const studentsQuery = query(collection(db, 'users'), where('classId', 'in', classIds));
        const studentsSnap = await getDocs(studentsQuery);
        myStudents = studentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
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
            navLinks.forEach(nav => nav.classList.remove('active'));
            link.classList.add('active');
            contentSections.forEach(section => {
                section.style.display = (section.id === targetId) ? 'block' : 'none';
            });

            // Special action for report tab
            if (targetId === 'student-progress') {
                generateTeacherReport();
            }
        });
    });
}

/**
 * Populates all "My Courses" dropdowns
 */
function populateCourseDropdowns() {
    const courseSelects = [
        document.getElementById('my-courses'),
        document.getElementById('assign-course'),
        document.getElementById('bulk-course-select') // <-- NEW
    ];

    courseSelects.forEach(select => {
        if (!select) return;
        select.innerHTML = '<option value="">Select a Course</option>';
        allCourses.forEach(course => {
            const option = document.createElement('option');
            option.value = course.id;
            option.textContent = course.title;
            select.appendChild(option);
        });
    });
}

/**
 * Sets up listeners for the Content Management section
 */
function setupContentManagementListeners() {
    const courseSelect = document.getElementById('my-courses');
    const courseEditor = document.getElementById('course-editor');
    const topicSelect = document.getElementById('video-topic');

    // Show editor when a course is selected
    courseSelect.addEventListener('change', () => {
        const selectedCourseId = courseSelect.value;
        if (selectedCourseId) {
            courseEditor.style.display = 'block';
            // Populate topics for the selected course
            const course = allCourses.find(c => c.id === selectedCourseId);
            topicSelect.innerHTML = '<option value="">Select a Topic</option>';
            if (course && course.topics) {
                Object.keys(course.topics).forEach(topicName => {
                    const option = document.createElement('option');
                    option.value = topicName;
                    option.textContent = topicName;
                    topicSelect.appendChild(option);
                });
            }
        } else {
            courseEditor.style.display = 'none';
        }
    });

    // Handle Add Topic form
    document.getElementById('add-topic-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const courseId = courseSelect.value;
        const topicName = document.getElementById('topic-name').value.trim();

        if (!courseId || !topicName) {
            alert('Please select a course and enter a topic name.');
            return;
        }

        try {
            const courseRef = doc(db, 'courses', courseId);
            // Use dot notation to add a new key (topic) to the 'topics' map
            await updateDoc(courseRef, {
                [`topics.${topicName}`]: [] // Initialize topic as empty array
            });
            alert('Topic added successfully!');
            // Refresh local data and UI
            await fetchTeacherData();
            // Manually update the dropdowns
            populateCourseDropdowns();
            courseSelect.value = courseId; // Re-select the same course
            courseSelect.dispatchEvent(new Event('change')); // Trigger change to re-populate topics
            e.target.reset();
        } catch (error) {
            console.error('Error adding topic: ', error);
            alert('Error adding topic. Check Firestore Rules. Error: ' + error.message);
        }
    });

    // Handle Add Video form (with better error logging)
    document.getElementById('add-video-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const courseId = courseSelect.value;
        const topicName = topicSelect.value;
        const videoTitle = document.getElementById('video-title').value;
        const videoId = document.getElementById('video-id').value;

        if (!courseId || !topicName || !videoTitle || !videoId) {
            alert('Please fill out all video fields.');
            return;
        }

        try {
            const courseRef = doc(db, 'courses', courseId);
            const newVideo = { title: videoTitle, videoId: videoId };
            
            // Use arrayUnion to add the new video object to the topic's array
            await updateDoc(courseRef, {
                [`topics.${topicName}`]: arrayUnion(newVideo)
            });

            alert('Video added successfully!');
            // Refresh data *after* update
            await fetchTeacherData(); 
            e.target.reset();
        } catch (error) {
            console.error('Error adding video: ', error);
            console.error('Debug Info:', { courseId, topicName, videoTitle, videoId });
            alert('Error adding video. Check console and Firestore Rules. Error: ' + error.message);
        }
    });
}

/**
 * NEW: Sets up listener for Bulk Content Upload
 */
function setupBulkUploadListener() {
    const uploadBtn = document.getElementById('bulk-upload-btn');
    const fileInput = document.getElementById('bulk-json-file');
    const courseSelect = document.getElementById('bulk-course-select');
    const statusEl = document.getElementById('bulk-upload-status');

    uploadBtn.addEventListener('click', () => {
        const courseId = courseSelect.value;
        const file = fileInput.files[0];

        if (!courseId || !file) {
            alert('Please select a course and a .json file.');
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            let content;
            try {
                content = JSON.parse(e.target.result);
                statusEl.textContent = 'Parsing file...';
                
                // Validate JSON structure
                if (!content.topicName || !Array.isArray(content.videos)) {
                    throw new Error('Invalid JSON format. Must have "topicName" (string) and "videos" (array).');
                }
                if (content.videos.some(v => !v.title || !v.videoId)) {
                    throw new Error('Invalid "videos" array. Each object must have "title" and "videoId".');
                }

                statusEl.textContent = 'Uploading to course...';
                const courseRef = doc(db, 'courses', courseId);
                
                // This will create the topic and add all videos at once.
                // If topic already exists, it will be OVERWRITTEN.
                await updateDoc(courseRef, {
                    [`topics.${content.topicName}`]: content.videos
                });

                statusEl.textContent = `Success! Topic "${content.topicName}" with ${content.videos.length} videos added.`;
                statusEl.className = 'status log-success';
                
                // Refresh data and UI
                await fetchTeacherData();
                populateCourseDropdowns(); 

            } catch (error) {
                console.error("Bulk Upload Error: ", error);
                statusEl.textContent = `Error: ${error.message}`;
                statusEl.className = 'status log-error';
            }
        };
        
        reader.onerror = () => {
            statusEl.textContent = 'Error reading file.';
            statusEl.className = 'status log-error';
        };

        reader.readAsText(file);
    });
}

/**
 * Populates the "Assign To" checkbox list with classes and students (Unchanged)
 */
function populateAssignmentStudents() {
    const container = document.getElementById('assignment-target-list');
    container.innerHTML = '';

    // Add Classes
    myClasses.forEach(c => {
        container.innerHTML += `
            <div class="checkbox-group">
                <input type="checkbox" id="class-${c.id}" class="assign-checkbox" data-type="class" data-id="${c.id}">
                <label for="class-${c.id}"><strong>Class: ${c.name}</strong></label>
            </div>
        `;
    });
    
    // Add Students
    myStudents.forEach(s => {
        const studentClass = myClasses.find(c => c.id === s.classId);
        const className = studentClass ? studentClass.name : 'No Class';
        container.innerHTML += `
            <div class="checkbox-group" style="padding-left: 20px;">
                <input type="checkbox" id="student-${s.id}" class="assign-checkbox" data-type="student" data-id="${s.id}">
                <label for="student-${s.id}">${s.email} (${className})</label>
            </div>
        `;
    });
}

/**
 * Sets up listeners for the Content Assignment section (Unchanged)
 */
function setupAssignmentListeners() {
    const courseSelect = document.getElementById('assign-course');
    const contentSelect = document.getElementById('assign-content');
    const assignBtn = document.getElementById('assign-btn');

    // Populate content dropdown when course changes
    courseSelect.addEventListener('change', () => {
        const courseId = courseSelect.value;
        contentSelect.innerHTML = '<option value="">Select Content</option>';
        contentSelect.disabled = true;
        assignBtn.disabled = true;

        if (courseId) {
            const course = allCourses.find(c => c.id === courseId);
            if (course && course.topics) {
                // Add topics
                Object.keys(course.topics).forEach(topicName => {
                    const option = document.createElement('option');
                    // Store complex data as a JSON string
                    option.value = JSON.stringify({ type: 'topic', courseId: course.id, topicName: topicName });
                    option.textContent = `Topic: ${topicName}`;
                    contentSelect.appendChild(option);
                });
                
                // Add individual videos
                Object.keys(course.topics).forEach(topicName => {
                    course.topics[topicName].forEach(video => {
                         const option = document.createElement('option');
                         option.value = JSON.stringify({ type: 'video', id: video.videoId });
                         option.textContent = `--- Video: ${video.title}`;
                         contentSelect.appendChild(option);
                    });
                });
            }
            contentSelect.disabled = false;
        }
    });

    // Enable assign button when content is selected
    contentSelect.addEventListener('change', () => {
        assignBtn.disabled = !contentSelect.value;
    });

    // Handle "Assign" button click
    assignBtn.addEventListener('click', async () => {
        const content = JSON.parse(contentSelect.value);
        const selectedCheckboxes = document.querySelectorAll('.assign-checkbox:checked');

        if (!content || selectedCheckboxes.length === 0) {
            alert('Please select content and at least one student or class.');
            return;
        }

        assignBtn.disabled = true;
        assignBtn.textContent = 'Assigning...';

        try {
            const assignments = [];
            selectedCheckboxes.forEach(box => {
                assignments.push(addDoc(collection(db, 'assignments'), {
                    content: content,
                    assignedToType: box.dataset.type,
                    assignedToId: box.dataset.id
                }));
            });

            await Promise.all(assignments);
            alert('Content assigned successfully!');
            
            // Clear selections
            selectedCheckboxes.forEach(box => box.checked = false);
            contentSelect.value = '';
            assignBtn.disabled = true;

        } catch (error) {
            console.error('Error assigning content: ', error);
            alert('Error assigning content. Check console.');
        } finally {
            assignBtn.textContent = 'Assign Selected';
        }
    });
}

/**
 * Generates and displays the progress report for the teacher's students (Unchanged)
 */
async function generateTeacherReport() {
    const reportOutput = document.getElementById('teacher-report-output');
    reportOutput.innerHTML = 'Generating report...';

    try {
        // 1. Create a map of all Video IDs to Video Titles from *this teacher's* courses
        const videoIdTitleMap = new Map();
        allCourses.forEach(course => {
            const topics = course.topics;
            for (const topicName in topics) {
                topics[topicName].forEach(video => {
                    videoIdTitleMap.set(video.videoId, video.title);
                });
            }
        });

        if (myStudents.length === 0) {
            reportOutput.innerHTML = 'You have no students assigned to your classes.';
            return;
        }

        // 2. For each student, get their progress
        let htmlOutput = '';
        for (const student of myStudents) {
            htmlOutput += `<div class="report-student-group"><h4>${student.email}</h4>`;
            
            const progressQuery = query(collection(db, 'progress'), where('userId', '==', student.id));
            const progressSnap = await getDocs(progressQuery);

            if (progressSnap.empty) {
                htmlOutput += '<ul><li>No progress recorded.</li></ul></div>';
                continue;
            }

            htmlOutput += '<ul>';
            progressSnap.forEach(progressDoc => {
                const data = progressDoc.data();
                // Only show videos that are in the teacher's courses
                if (videoIdTitleMap.has(data.videoId)) {
                    const title = videoIdTitleMap.get(data.videoId);
                    htmlOutput += `
                        <li>
                            <strong>${title}</strong>: 
                            ${data.completionPercentage || 0}% Complete | 
                            ${data.watchCount || 0} Views | 
                            ${data.watchTime || 0}s Watched
                        </li>
                    `;
                }
            });
            htmlOutput += '</ul></div>';
        }
        reportOutput.innerHTML = htmlOutput;

    } catch (error) {
        console.error("Error generating report: ", error);
        reportOutput.innerHTML = 'Error generating report. Check console.';
    }
}
