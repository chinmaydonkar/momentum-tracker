import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot,
} from 'firebase/firestore';
import {
  Notebook,
  Dumbbell,
  Apple,
  Clock,
  Loader2,
  CalendarDays
} from 'lucide-react';

// Main App component where all our logic will live
export default function App() {
  // Global variables provided by the Canvas environment for Firebase setup
  const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
  const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
  const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : '';

  // State variables for Firebase, user, and app data
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentView, setCurrentView] = useState('journal');

  // Utility function to get today's date in YYYY-MM-DD format
  const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().slice(0, 10);
  };
  const todayDate = getTodayDate();

  // State for different sections of the app
  const [journalText, setJournalText] = useState('');
  const [foodText, setFoodText] = useState('');
  const [gymExercises, setGymExercises] = useState([]);
  const [dailyLog, setDailyLog] = useState([]);
  const [activityText, setActivityText] = useState('');
  const [activityTime, setActivityTime] = useState('');

  /**
   * Firebase Initialization and Authentication
   */
  useEffect(() => {
    if (Object.keys(firebaseConfig).length > 0) {
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const authInstance = getAuth(app);

      setDb(firestore);
      setAuth(authInstance);

      const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
        if (user) {
          setUserId(user.uid);
        } else {
          try {
            if (initialAuthToken) {
              await signInWithCustomToken(authInstance, initialAuthToken);
            } else {
              await signInAnonymously(authInstance);
            }
          } catch (e) {
            console.error("Error signing in:", e);
            setError("Could not sign in. Please try again.");
          }
        }
        setIsAuthReady(true);
      });

      return () => unsubscribe();
    }
  }, [firebaseConfig, initialAuthToken]);

  /**
   * Data Fetching with Real-time Listener
   */
  useEffect(() => {
    if (isAuthReady && db && userId) {
      setLoading(true);
      const habitRef = doc(db, 'artifacts', appId, 'users', userId, 'habits', todayDate);

      const unsubscribe = onSnapshot(habitRef, (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setJournalText(data.journal || '');
          setFoodText(data.food || '');
          setGymExercises(data.gym || []);
          setDailyLog(data.activities || []);
        } else {
          setJournalText('');
          setFoodText('');
          setGymExercises([]);
          setDailyLog([]);
        }
        setLoading(false);
      }, (err) => {
        console.error("Error fetching data:", err);
        setError("Could not load your data. Please check your connection.");
        setLoading(false);
      });

      return () => unsubscribe();
    }
  }, [isAuthReady, db, userId, todayDate, appId]);

  /**
   * Centralized Data Saving Function
   */
  const saveData = async (updates) => {
    if (!db || !userId) {
      console.error("Database or user ID not available.");
      return;
    }
    const docRef = doc(db, 'artifacts', appId, 'users', userId, 'habits', todayDate);
    try {
      await setDoc(docRef, updates, { merge: true });
      console.log("Data successfully saved!");
    } catch (e) {
      console.error("Error saving document: ", e);
      setError("Failed to save data. Please try again.");
    }
  };

  /**
   * Handlers for User Actions
   */
  const handleAddActivity = async (e) => {
    e.preventDefault();
    if (activityText.trim() && activityTime.trim()) {
      const newActivity = { text: activityText, time: activityTime, timestamp: new Date().toISOString() };
      const updatedLog = [...dailyLog, newActivity];
      await saveData({ activities: updatedLog });
      setActivityText('');
      setActivityTime('');
    }
  };

  const handleAddGymExercise = async (e) => {
    e.preventDefault();
    const exerciseName = e.target.exerciseName.value;
    const sets = e.target.sets.value;
    const reps = e.target.reps.value;

    if (exerciseName && sets && reps) {
      const newExercise = { name: exerciseName, sets: parseInt(sets), reps: parseInt(reps), timestamp: new Date().toISOString() };
      const updatedGym = [...gymExercises, newExercise];
      await saveData({ gym: updatedGym });
      e.target.reset();
    }
  };

  const handleSaveJournal = async () => {
    await saveData({ journal: journalText });
  };

  const handleSaveFood = async () => {
    await saveData({ food: foodText });
  };

  /**
   * Rendering the UI based on state
   */
  const renderView = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center p-6 bg-gray-50 rounded-lg shadow-md mt-4 animate-pulse">
          <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
          <p className="mt-2 text-gray-500">Loading your data...</p>
        </div>
      );
    }
    if (error) {
      return (
        <div className="p-6 text-center text-red-500 bg-red-100 border border-red-200 rounded-lg shadow-md mt-4">
          <p>{error}</p>
        </div>
      );
    }

    switch (currentView) {
      case 'journal':
        return (
          <div className="p-6 bg-white rounded-lg shadow-md mt-4">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Daily Journal</h2>
            <textarea
              className="w-full h-48 p-3 text-gray-700 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              placeholder="Start writing about your day here..."
              value={journalText}
              onChange={(e) => setJournalText(e.target.value)}
              onBlur={handleSaveJournal}
            ></textarea>
          </div>
        );
      case 'gym':
        return (
          <div className="p-6 bg-white rounded-lg shadow-md mt-4">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Gym Workout Log</h2>
            <form onSubmit={handleAddGymExercise} className="space-y-4">
              <input
                type="text"
                name="exerciseName"
                placeholder="Exercise Name"
                className="w-full p-3 text-gray-700 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                required
              />
              <div className="flex gap-4">
                <input
                  type="number"
                  name="sets"
                  placeholder="Sets"
                  className="w-1/2 p-3 text-gray-700 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                  required
                />
                <input
                  type="number"
                  name="reps"
                  placeholder="Reps"
                  className="w-1/2 p-3 text-gray-700 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
                  required
                />
              </div>
              <button type="submit" className="w-full bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors">
                Add Exercise
              </button>
            </form>

            <div className="mt-6">
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Today's Exercises:</h3>
              {gymExercises.length > 0 ? (
                <ul className="space-y-2">
                  {gymExercises.map((exercise, index) => (
                    <li key={index} className="flex items-center justify-between p-3 bg-gray-100 rounded-md">
                      <span className="text-gray-800">{exercise.name}</span>
                      <span className="text-sm text-gray-600">{exercise.sets} sets x {exercise.reps} reps</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500 text-center">No exercises logged yet.</p>
              )}
            </div>
          </div>
        );
      case 'food':
        return (
          <div className="p-6 bg-white rounded-lg shadow-md mt-4">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Food Intake</h2>
            <textarea
              className="w-full h-48 p-3 text-gray-700 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              placeholder="Log your meals and snacks for the day..."
              value={foodText}
              onChange={(e) => setFoodText(e.target.value)}
              onBlur={handleSaveFood}
            ></textarea>
          </div>
        );
      case 'activities':
        return (
          <div className="p-6 bg-white rounded-lg shadow-md mt-4">
            <h2 className="text-xl font-bold text-gray-800 mb-4">Daily Activity Log</h2>
            <form onSubmit={handleAddActivity} className="flex flex-col sm:flex-row gap-4 mb-4">
              <input
                type="text"
                placeholder="What did you do?"
                value={activityText}
                onChange={(e) => setActivityText(e.target.value)}
                className="flex-1 p-3 text-gray-700 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              />
              <input
                type="text"
                placeholder="Time spent (e.g., 30 min, 2 hrs)"
                value={activityTime}
                onChange={(e) => setActivityTime(e.target.value)}
                className="flex-1 p-3 text-gray-700 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              />
              <button type="submit" className="bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors">
                Add Log
              </button>
            </form>

            <div className="mt-6">
              <h3 className="text-lg font-semibold text-gray-700 mb-2">Today's Activities:</h3>
              {dailyLog.length > 0 ? (
                <ul className="space-y-2">
                  {dailyLog.map((log, index) => (
                    <li key={index} className="flex items-center justify-between p-3 bg-gray-100 rounded-md">
                      <span className="text-gray-800">{log.text}</span>
                      <span className="text-sm text-gray-600">{log.time}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500 text-center">No activities logged yet.</p>
              )}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  /**
   * The Main Return Block (The UI)
   */
  return (
    <div className="min-h-screen bg-gray-100 font-sans p-4 sm:p-8 flex items-center justify-center">
      <div className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden p-6 sm:p-8">
        <header className="mb-6 text-center">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 leading-tight">
            Daily Momentum Tracker
          </h1>
          <p className="text-gray-500 mt-2 text-sm sm:text-base">
            <CalendarDays className="inline-block h-4 w-4 mr-1 mb-1" />
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </header>

        {/* Navigation Tabs */}
        <div className="flex justify-center flex-wrap gap-4 mb-6 border-b border-gray-200 pb-4">
          <button
            onClick={() => setCurrentView('journal')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-all ${currentView === 'journal' ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
          >
            <Notebook className="h-5 w-5" /> Journal
          </button>
          <button
            onClick={() => setCurrentView('gym')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-all ${currentView === 'gym' ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
          >
            <Dumbbell className="h-5 w-5" /> Gym
          </button>
          <button
            onClick={() => setCurrentView('food')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-all ${currentView === 'food' ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
          >
            <Apple className="h-5 w-5" /> Food
          </button>
          <button
            onClick={() => setCurrentView('activities')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-all ${currentView === 'activities' ? 'bg-blue-600 text-white shadow-lg' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
          >
            <Clock className="h-5 w-5" /> Activities
          </button>
        </div>

        {renderView()}

      </div>
    </div>
  );
}
