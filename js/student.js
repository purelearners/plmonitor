import {
    auth,
    db,
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    query,
    where,
    increment,
    runTransaction,
    onAuthStateChanged
} from './firebase-config.js';

let currentUser = null;
let currentUserData = null;
let player; // YouTube player object
let currentVideoId = null;
let progressInterval = null; // Timer for tracking watch time

// Wait for the DOM and Auth state
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            loadStudentDashboard();
        }
    });
});

/**
 * Main function to load all student data and render the page
 */
async function loadStudentDashboard() {
    const container = document.getElementById('course-content-container');
    container.innerHTML = '<p>Loading your profile...</p>';

    try {
        // 1. Get User's Role and Class info
        const userDocSnap = await getDoc(doc(db, 'users', currentUser.uid));
        if (!userDocSnap.exists() || userDocSnap.data().role !== 'student') {
            container.innerHTML = '<p>Error: You are not registered as a student.</p>';
            return;
        }
        currentUserData = userDocSnap.data();

        // 2. Fetch all courses (to show full structure)
        const coursesSnap = await getDocs(collection(db, 'courses'));
        const allCourses = coursesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // 3. Fetch all progress for this user
        const progressQuery = query(collection(db, 'progress'), where('userId', '==', currentUser.uid));
        const progressSnap = await getDocs(progressQuery);
        const progressMap = new Map();
        progressSnap.forEach(doc => {
            progressMap.set(doc.data().videoId, doc.data());
        });
        
        // 4. Fetch assignments (for student AND their class)
        const studentAssignQuery = query(collection(db, 'assignments'), where('assignedToType', '==', 'student'), where('assignedToId', '==', currentUser.uid));
        const classAssignQuery = query(collection(db, 'assignments'), where('assignedToType', '==', 'class'), where('assignedToId', '==', currentUserData.classId));
        
        const [studentAssignSnap, classAssignSnap] = await Promise.all([
            getDocs(studentAssignQuery),
            getDocs(classAssignQuery)
        ]);

        // 5. Build the Set of allowed video IDs
        const allowedVideoIds = new Set();
        const allAssignments = [...studentAssignSnap.docs, ...classAssignSnap.docs];

        for (const assignDoc of allAssignments) {
            const assignment = assignDoc.data().content;
            if (assignment.type === 'video') {
                allowedVideoIds.add(assignment.id);
            } else if (assignment.type === 'topic') {
                // Find the course and add all videos from that topic
                const course = allCourses.find(c => c.id === assignment.courseId);
                if (course && course.topics[assignment.topicName]) {
                    course.topics[assignment.topicName].forEach(video => {
                        allowedVideoIds.add(video.videoId);
                    });
                }
            }
        }

        // 6. Render the UI
        renderCourseContent(allCourses, allowedVideoIds, progressMap);

    } catch (error) {
        console.error("Error loading student dashboard:", error);
        container.innerHTML = '<p>There was an error loading your courses. Please try again later.</p>';
    }
}

/**
 * Renders the full course list with locked/unlocked videos
 */
function renderCourseContent(allCourses, allowedVideoIds, progressMap) {
    const container = document.getElementById('course-content-container');
    let html = '';

    if (allCourses.length === 0) {
        container.innerHTML = '<p>No courses are available in the system yet.</p>';
        return;
    }

    allCourses.forEach(course => {
        html += `<div class="course-block"><h2>${course.title}</h2>`;
        const topics = course.topics;

        if (!topics || Object.keys(topics).length === 0) {
            html += '<p>This course has no topics yet.</p>';
        } else {
            for (const topicName in topics) {
                html += `<div class="topic-block">
                            <h3>${topicName}</h3>`;
                
                const videos = topics[topicName];
                if (videos.length === 0) {
                     html += '<p>This topic has no videos yet.</p>';
                } else {
                    videos.forEach(video => {
                        const isAssigned = allowedVideoIds.has(video.videoId);
                        const progress = progressMap.get(video.videoId) || { completionPercentage: 0, watchCount: 0 };

                        if (isAssigned) {
                            html += `
                                <button class="btn video-btn" 
                                        data-video-id="${video.videoId}" 
                                        data-video-title="${video.title}">
                                    ${video.title} (${progress.completionPercentage}% | Views: ${progress.watchCount})
                                </button>
                            `;
                        } else {
                            html += `
                                <button class="btn locked-btn" disabled>
                                    ${video.title}
                                </button>
                            `;
                        }
                    });
                }
                html += `</div>`; // .topic-block
            }
        }
        html += `</div>`; // .course-block
    });

    container.innerHTML = html;
    // Add event listeners to the new buttons
    setupVideoClickListeners();
}


/**
 * Sets up modal and video player functionality
 */
function setupVideoClickListeners() {
    const modal = document.getElementById('video-modal');
    const modalTitle = document.getElementById('video-modal-title');
    const closeModalBtn = document.querySelector('.close-modal-btn');
    const container = document.getElementById('course-content-container');

    // Handle clicks on video buttons
    container.addEventListener('click', (e) => {
        const button = e.target.closest('.video-btn');
        if (button) {
            currentVideoId = button.dataset.videoId;
            const videoTitle = button.dataset.videoTitle;
            
            modalTitle.textContent = videoTitle;
            modal.style.display = 'block';
            
            // Create player if it doesn't exist, or just load video if it does
            if (player) {
                player.loadVideoById(currentVideoId);
            } else {
                // This function is global thanks to loading the YT API script in student.html
                window.onYouTubeIframeAPIReady = () => {
                    createPlayer(currentVideoId);
                };
                // In case API is already ready
                if (window.YT && window.YT.Player) {
                    createPlayer(currentVideoId);
                }
            }
        }
    });

    // Handle modal close
    const closeModal = () => {
        modal.style.display = 'none';
        if (player) {
            player.stopVideo(); // Stop video playback
            player.destroy();   // Destroy the player instance
            player = null;
        }
        clearInterval(progressInterval); // Stop tracking
        currentVideoId = null;
    };

    closeModalBtn.addEventListener('click', closeModal);
    // Also close if clicking outside the modal content
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
}

/**
 * Creates a new YouTube player instance
 */
function createPlayer(videoId) {
    player = new YT.Player('youtube-player', {
        height: '390',
        width: '640',
        videoId: videoId,
        playerVars: {
            'playsinline': 1,
            'modestbranding': 1, // No YouTube logo
            'rel': 0,            // No related videos
            'showinfo': 0,       // No video title/uploader
            'fs': 0,             // No fullscreen button
            'controls': 1        // Show player controls
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
}

/**
 * YouTube API: Called when player is ready
 */
function onPlayerReady(event) {
    event.target.playVideo();
}

/**
 * YouTube API: Called when player state changes (playing, paused, ended, etc.)
 */
function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING) {
        // Start tracking progress
        clearInterval(progressInterval); // Clear any existing timer
        progressInterval = setInterval(trackVideoProgress, 5000);
        // Also run once immediately
        trackVideoProgress();
    } 
    else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.BUFFERING) {
        // Stop tracking
        clearInterval(progressInterval);
    }
    else if (event.data === YT.PlayerState.ENDED) {
        // Stop tracking and increment watch count
        clearInterval(progressInterval);
        // Make sure one final progress track runs to get 100%
        trackVideoProgress(true); 
        incrementWatchCount();
    }
}

/**
 * Tracks and saves video progress to Firestore every 5 seconds
 */
async function trackVideoProgress(isEnded = false) {
    if (!player || !player.getCurrentTime || !currentVideoId || !currentUser) return;

    const watchTime = Math.floor(player.getCurrentTime());
    const duration = player.getDuration();
    let completionPercentage = 0;
    
    if (duration > 0) {
        completionPercentage = Math.floor((watchTime / duration) * 100);
    }
    if (isEnded) {
        completionPercentage = 100; // Ensure 100% on end
    }

    const progressId = `${currentUser.uid}_${currentVideoId}`;
    const progressRef = doc(db, 'progress', progressId);

    try {
        // Use a transaction to only update if watchTime or percentage is higher
        await runTransaction(db, async (transaction) => {
            const progDoc = await transaction.get(progressRef);
            const existingData = progDoc.data() || {};

            const newWatchTime = Math.max(existingData.watchTime || 0, watchTime);
            const newPercentage = Math.max(existingData.completionPercentage || 0, completionPercentage);

            const dataToSet = {
                userId: currentUser.uid,
                videoId: currentVideoId,
                watchTime: newWatchTime,
                completionPercentage: newPercentage
            };
            
            // Ensure watchCount exists, but don't clobber it
            if (!existingData.watchCount) {
                dataToSet.watchCount = 0;
            }

            transaction.set(progressRef, dataToSet, { merge: true });
        });

    } catch (error) {
        console.error("Error tracking progress: ", error);
        // Stop interval if transaction fails, to avoid spamming errors
        clearInterval(progressInterval); 
    }
}

/**
 * Atomically increments the watch count for the current video
 */
async function incrementWatchCount() {
    if (!currentVideoId || !currentUser) return;

    const progressId = `${currentUser.uid}_${currentVideoId}`;
    const progressRef = doc(db, 'progress', progressId);

    try {
        // setDoc with merge:true and increment(1) will create the doc
        // if it doesn't exist, or just update the field if it does.
        // This is atomic and robust.
        await setDoc(progressRef, {
            watchCount: increment(1),
            userId: currentUser.uid, // Ensure these fields exist
            videoId: currentVideoId  // if doc is new
        }, { merge: true });

        console.log('Watch count incremented for', currentVideoId);
    } catch (error) {
        console.error("Error incrementing watch count: ", error);
    }
}
