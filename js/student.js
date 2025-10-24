import { auth, db } from './firebase-config.js';
import { doc, getDoc, collection, query, where, getDocs, runTransaction, setDoc } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";

let player;
let progressInterval;
let currentVideoId; 

// Load the YouTube Iframe Player API script
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(tag);

// Global function required by the API
window.onYouTubeIframeAPIReady = function() {
    console.log("YouTube API is ready.");
};

// --- GATING LOGIC ---
async function checkContentAccess(studentUid, studentClassId, contentId) {
    const assignmentsRef = collection(db, 'assignments');
    
    // Check for assignment to specific student or class
    const assignmentQuery = query(assignmentsRef, 
        where('contentRef', '==', contentId), 
        where('assignedToId', 'in', [studentUid, studentClassId]) // Check both student UID and Class ID
    );
    const result = await getDocs(assignmentQuery);
    return !result.empty;
}

// --- PROGRESS TRACKING LOGIC ---
function saveProgressToFirestore(currentTime, totalDuration, percentage) {
    const userId = auth.currentUser.uid;
    const docId = currentVideoId + '_' + userId;
    const progressRef = doc(db, 'progress', docId);

    // Save/update the max progress achieved
    setDoc(progressRef, {
        userId: userId,
        videoId: currentVideoId,
        watchTime: Math.floor(currentTime),
        totalDuration: Math.floor(totalDuration),
        completionPercentage: percentage
    }, { merge: true }) 
    .catch(error => console.error("Error updating progress: ", error));
}

// Increments watch count when video ends (Full Watch)
async function incrementWatchCount() {
    const userId = auth.currentUser.uid;
    const docId = currentVideoId + '_' + userId;
    const progressRef = doc(db, 'progress', docId);

    try {
        await runTransaction(db, async (transaction) => {
            const docSnap = await transaction.get(progressRef);
            const newCount = (docSnap.exists() ? docSnap.data().watchCount || 0 : 0) + 1;

            transaction.set(progressRef, { 
                watchCount: newCount, 
                userId: userId,
                videoId: currentVideoId
            }, { merge: true }); 
        });
    } catch (error) {
        console.error("Transaction failed to update watch count: ", error);
    }
}

// YouTube Player Event Handlers
function onPlayerStateChange(event) {
    if (event.data !== YT.PlayerState.PLAYING) {
        clearInterval(progressInterval);
    }
    
    if (event.data === YT.PlayerState.ENDED) {
        incrementWatchCount();
        // Pause and close modal after end
        if(player) player.pauseVideo();
        document.getElementById('video-modal').style.display='none';
    }
    
    if (event.data === YT.PlayerState.PLAYING) {
        progressInterval = setInterval(() => {
            const currentTime = player.getCurrentTime();
            const totalDuration = player.getDuration();
            const percentage = Math.round((currentTime / totalDuration) * 100);
            saveProgressToFirestore(currentTime, totalDuration, percentage);
        }, 5000); 
    }
}

// Initializes the player in a modal/container with restrictions
function openVideoModal(youtubeId, videoDbId) {
    currentVideoId = videoDbId;

    const playerConfig = {
        height: '390',
        width: '640',
        videoId: youtubeId,
        playerVars: {
            // RESTRICTION PARAMETERS to prevent external links
            'modestbranding': 1, // Hides the YouTube logo
            'rel': 0,            // Prevents showing related videos
            'showinfo': 0,       // Hides video title and uploader info
            'fs': 0,             // Disables fullscreen button
            'controls': 1,       // Keeps standard controls
            'playsinline': 1     
        },
        events: {
            'onStateChange': onPlayerStateChange
        }
    };

    if (player) {
        player.loadVideoById(youtubeId);
    } else {
        player = new YT.Player('player-container', playerConfig); 
    }
    
    document.getElementById('video-modal').style.display = 'flex';
}

// --- INITIAL COURSE RENDER ---
async function renderCourse() {
    const user = auth.currentUser;
    if (!user) return;

    const courseContainer = document.getElementById('course-content');
    courseContainer.innerHTML = '<p>Loading course content...</p>';
    
    try {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const { classId } = userDoc.data();
        
        const courseSnap = await getDoc(doc(db, "courses", "main-course"));
        if (!courseSnap.exists() || !courseSnap.data().topics) {
            courseContainer.innerHTML = '<p>Course not configured by teacher.</p>';
            return;
        }
        
        const courseData = courseSnap.data();
        courseContainer.innerHTML = ''; 

        // Sort topics by their defined order (assuming order is a field in the topic object)
        const sortedTopics = Object.entries(courseData.topics).sort(([, a], [, b]) => (a.order || 0) - (b.order || 0));

        for (const [topicId, topic] of sortedTopics) {
            const topicEl = document.createElement('div');
            topicEl.className = 'topic-item';
            topicEl.innerHTML = `<h3>${topic.title}</h3>`;
            courseContainer.appendChild(topicEl);

            for (const video of topic.videos) {
                const videoDbId = video.id;
                const isAssigned = await checkContentAccess(user.uid, classId, videoDbId);
                
                const progressDoc = await getDoc(doc(db, 'progress', videoDbId + '_' + user.uid));
                const progress = progressDoc.exists() ? progressDoc.data() : { completionPercentage: 0, watchCount: 0 };

                const btn = document.createElement('button');
                btn.className = 'video-button';
                btn.textContent = `${video.title} (${progress.completionPercentage || 0}% | Views: ${progress.watchCount || 0})`;

                if (isAssigned) {
                    btn.onclick = () => openVideoModal(video.youtubeId, videoDbId);
                    btn.title = 'Click to watch';
                } else {
                    btn.disabled = true;
                    btn.textContent += ' 🔒 (Locked)';
                    btn.title = 'Content not assigned yet.';
                }
                topicEl.appendChild(btn);
            }
        }
    } catch (error) {
        console.error("Error rendering course:", error);
        courseContainer.innerHTML = `<p style="color:red;">Error loading course data: ${error.message}</p>`;
    }
}

// Wait for user authentication to render
onAuthStateChanged(auth, (user) => {
    if (user) {
        renderCourse();
    }
});
