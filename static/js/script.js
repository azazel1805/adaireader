document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed. Version: Enhanced TTS Debugging & Voice Selection.");

    // Element getters
    const bookSelect = document.getElementById('book-select');
    const bookIdInput = document.getElementById('book-id-input');
    const loadBookBtn = document.getElementById('load-book-btn');
    const bookContentDiv = document.getElementById('book-content');
    
    const addToMyWordsBtn = document.getElementById('add-to-my-words-btn');
    const readFromSelectionBtn = document.getElementById('read-from-selection-btn');
    const myWordsListUl = document.getElementById('my-words-list');

    const readBookBtn = document.getElementById('read-book-btn');
    const pauseReadingBtn = document.getElementById('pause-reading-btn');
    const resumeReadingBtn = document.getElementById('resume-reading-btn');
    const stopReadingBtn = document.getElementById('stop-reading-btn');
    const ttsStatusP = document.getElementById('tts-status');

    const vocabPopup = document.getElementById('vocab-popup');
    const vocabWordEl = document.getElementById('vocab-word');
    const vocabDefinitionEl = document.getElementById('vocab-definition');
    const loadingIndicator = document.getElementById('loading-indicator');
    const errorMessageDiv = document.getElementById('error-message');

    // Check for all essential elements (good practice)
    // ... (keep your essentialElements check here)

    let currentBookText = "";
    let isReading = false; 
    let isPaused = false;
    let speechSynthesis = window.speechSynthesis;
    let currentUtterance = null; 
    let myWords = []; 
    let availableVoices = []; // To store loaded voices

    // Chrome TTS Workaround: "Warm up" the engine
    let ttsEnginePrimed = false;
    function primeTTSEngine() {
        if (!ttsEnginePrimed && speechSynthesis && availableVoices.length > 0) { 
            console.log("Priming TTS Engine for Chrome with a short, silent utterance...");
            const primer = new SpeechSynthesisUtterance('Hello'); 
            primer.volume = 0.01; 
            primer.rate = 5; 
            
            const englishVoice = availableVoices.find(voice => voice.lang === 'en-US' && voice.localService === true) ||
                                 availableVoices.find(voice => voice.lang === 'en-US');
            if (englishVoice) {
                primer.voice = englishVoice;
                console.log("Primer using voice:", englishVoice.name);
            } else {
                console.warn("Primer: No en-US voice found for priming.");
            }

            primer.onend = () => {
                console.log("TTS Primer utterance ended successfully.");
                ttsEnginePrimed = true;
            };
            primer.onerror = (event) => {
                console.error("TTS Primer utterance error:", event.error, event);
                // Consider not setting ttsEnginePrimed to true if primer fails critically
            };
            try {
                speechSynthesis.speak(primer);
            } catch (e) {
                console.error("Error speaking primer utterance:", e);
            }
        } else if (!ttsEnginePrimed && speechSynthesis) {
            console.log("PrimeTTSEngine: Voices not yet loaded or SpeechSynthesis not ready. Will try again later or on first speak.");
            loadAndLogVoices(); // Attempt to load voices if not already available
        }
    }
    
    function loadAndLogVoices() {
        if (!speechSynthesis) return;
        availableVoices = speechSynthesis.getVoices();
        console.log("Available TTS voices (sync call):", availableVoices);

        if (availableVoices.length === 0 && speechSynthesis.onvoiceschanged === null) {
            console.log("No voices loaded yet (sync), setting up onvoiceschanged event...");
            speechSynthesis.onvoiceschanged = () => {
                availableVoices = speechSynthesis.getVoices();
                console.log("TTS voices loaded (onvoiceschanged event):", availableVoices);
                if (availableVoices.length === 0) {
                    console.warn("Still no TTS voices available after onvoiceschanged!");
                }
                // Once voices are loaded, we don't need this listener anymore for this session
                // However, some browsers might fire it multiple times.
                // For simplicity, we'll let it be.
            };
        } else if (availableVoices.length === 0) {
             console.warn("No TTS voices available initially. The onvoiceschanged event might be necessary or already set.");
        }
    }


    if (!speechSynthesis) {
        console.warn("SpeechSynthesis API is not available in this browser.");
        if(ttsStatusP) ttsStatusP.textContent = "TTS not supported by this browser.";
        [readBookBtn, pauseReadingBtn, resumeReadingBtn, stopReadingBtn, readFromSelectionBtn].forEach(btn => btn.disabled = true);
    } else {
        console.log("SpeechSynthesis API is available.");
        speechSynthesis.cancel(); 
        loadAndLogVoices(); // Attempt to load voices on initialization
        updateTTSButtonStates();
    }

    // --- Personal Word List ---
    function loadMyWords() { 
        const storedWords = localStorage.getItem('myGutenbergWords');
        if (storedWords) {
            try {
                myWords = JSON.parse(storedWords);
                if (!Array.isArray(myWords)) myWords = []; 
            } catch (e) {
                console.error("Error parsing 'myGutenbergWords' from localStorage:", e);
                myWords = [];
            }
        }
        renderMyWordsList();
    }
    function saveMyWords() { 
        localStorage.setItem('myGutenbergWords', JSON.stringify(myWords));
    }
    function addToMyWords(text) { 
        const cleanedText = text.trim();
        if (cleanedText && !myWords.includes(cleanedText) && cleanedText.length < 50) {
            myWords.push(cleanedText);
            myWords.sort();
            saveMyWords();
            renderMyWordsList();
        } else if (myWords.includes(cleanedText)) {
            console.log(`"${cleanedText}" is already in My Words.`);
        } else if (cleanedText.length >= 50) {
            displayError("Selected text is too long for 'My Words'. Keep it under 50 characters.");
        }
    }
    function renderMyWordsList() { 
        myWordsListUl.innerHTML = '';
        if (myWords.length === 0) {
            myWordsListUl.innerHTML = '<li>Your saved words will appear here. Select text in the book and click "Add to My Words".</li>';
        } else {
            myWords.forEach(word => {
                const li = document.createElement('li');
                li.textContent = word;
                li.title = `Click to see definition for "${word}"`;
                li.addEventListener('click', () => fetchAndShowDefinition(word, li));
                myWordsListUl.appendChild(li);
            });
        }
    }
    addToMyWordsBtn.addEventListener('click', () => { 
        const selectedText = window.getSelection().toString().trim();
        if (selectedText) {
            addToMyWords(selectedText);
        } else {
            displayError("No text selected to add to 'My Words'.");
        }
    });

    // --- Predefined Book List ---
    const preselectedBooks = [ 
        { title: "Alice's Adventures in Wonderland by Lewis Carroll", id: "11" },
        { title: "Pride and Prejudice by Jane Austen", id: "1342" },
        { title: "The Adventures of Sherlock Holmes by Arthur Conan Doyle", id: "1661" },
        { title: "A Tale of Two Cities by Charles Dickens", id: "98" },
        { title: "Moby Dick; or The Whale by Herman Melville", id: "2701" },
        { title: "Frankenstein; Or, The Modern Prometheus by Mary Shelley", id: "84" },
        { title: "Dracula by Bram Stoker", id: "345" },
        { title: "The Picture of Dorian Gray by Oscar Wilde", id: "174" },
        { title: "The Great Gatsby by F. Scott Fitzgerald", id: "64317" },
        { title: "Jane Eyre by Charlotte Brontë", id: "1260" },
        { title: "War and Peace by Leo Tolstoy", id: "2600" },
        { title: "The Iliad by Homer", id: "6130" },
        { title: "The Odyssey by Homer", id: "1727" },
        { title: "Adventures of Huckleberry Finn by Mark Twain", id: "76" },
        { title: "The Adventures of Tom Sawyer by Mark Twain", id: "74" },
        { title: "Treasure Island by Robert Louis Stevenson", id: "120" },
        { title: "The Call of the Wild by Jack London", id: "215" },
        { title: "Anne of Green Gables by L. M. Montgomery", id: "45" },
        { title: "Little Women by Louisa May Alcott", id: "514" },
        { title: "The Importance of Being Earnest by Oscar Wilde", id: "844" },
        { title: "Metamorphosis by Franz Kafka", id: "5200" },
        { title: "The Yellow Wallpaper by Charlotte Perkins Gilman", id: "1952" },
        { title: "A Christmas Carol by Charles Dickens", id: "46" },
        { title: "Great Expectations by Charles Dickens", id: "1400" },
        { title: "The Scarlet Letter by Nathaniel Hawthorne", id: "25344" },
        { title: "Wuthering Heights by Emily Brontë", id: "768" },
        { title: "Don Quixote by Miguel de Cervantes Saavedra", id: "996" },
        { title: "The Count of Monte Cristo by Alexandre Dumas", id: "1184" },
        { title: "Grimms' Fairy Tales by Jacob Grimm and Wilhelm Grimm", id: "2591" },
        { title: "A Modest Proposal by Jonathan Swift", id: "1080" },
        { title: "The Republic by Plato", id: "1497" },
        { title: "The Prince by Niccolò Machiavelli", id: "1232" },
        { title: "Ulysses by James Joyce", id: "4300" },
        { title: "Siddhartha by Hermann Hesse", id: "2500" },
        { title: "The Time Machine by H. G. Wells", id: "35" },
        { title: "The War of the Worlds by H. G. Wells", id: "36" },
        { title: "Heart of Darkness by Joseph Conrad", id: "219" },
        { title: "The Wonderful Wizard of Oz by L. Frank Baum", id: "55" },
        { title: "Relativity: The Special and General Theory by Albert Einstein", id: "5001" },
        { title: "The Souls of Black Folk by W. E. B. Du Bois", id: "408" }
    ];

    function populateBookSelect() { 
        console.log("Populating book select dropdown.");
        preselectedBooks.forEach(book => {
            const option = document.createElement('option');
            option.value = book.id;
            option.textContent = book.title;
            bookSelect.appendChild(option);
        });
    }
    
    // --- Helper Functions ---
    function displayError(message) { 
        console.error("Displaying error to user:", message);
        errorMessageDiv.textContent = message;
        errorMessageDiv.style.display = 'block';
        setTimeout(() => { errorMessageDiv.style.display = 'none'; }, 7000);
    }
    function showLoading(show) { 
        loadingIndicator.style.display = show ? 'block' : 'none';
    }

    // --- Book Loading ---
    bookSelect.addEventListener('change', () => { 
        if (bookSelect.value) {
            bookIdInput.value = bookSelect.value;
        }
    });
    loadBookBtn.addEventListener('click', loadBook);
    bookIdInput.addEventListener('keypress', (event) => { 
        if (event.key === 'Enter') {
            loadBook();
        }
    });
    async function loadBook() { 
        primeTTSEngine(); // Attempt to prime TTS engine on book load
        const bookId = bookIdInput.value.trim();
        if (!bookId) { 
            displayError("Please select or enter a Book ID.");
            return; 
        }
        showLoading(true);
        bookContentDiv.innerHTML = '<p>Loading book...</p>';
        currentBookText = "";
        stopReading(); 
        if (speechSynthesis && (speechSynthesis.speaking || speechSynthesis.pending)) {
            speechSynthesis.cancel();
        }
        try {
            const response = await fetch(`/fetch_book/${bookId}`);
            if (!response.ok) { 
                const errorData = await response.json().catch(() => ({error: "Unknown error structure from backend"}));
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            currentBookText = data.text || "";
            displayBookText(currentBookText);
        } catch (error) { 
            console.error('Error loading book:', error);
            displayError(`Failed to load book: ${error.message}`);
            bookContentDiv.innerHTML = '<p>Failed to load book. Check console for details.</p>';
        }
        finally {
            showLoading(false);
            updateTTSButtonStates();
        }
    }
    function displayBookText(text) { 
        bookContentDiv.textContent = text;
    }

    // --- Text Selection Handling (Only for enabling buttons, NO vocab popup here) ---
    bookContentDiv.addEventListener('mouseup', handleBookTextSelection);
    function handleBookTextSelection(event) {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();

        if (selectedText && selectedText.length > 0) {
            readFromSelectionBtn.disabled = false;
            addToMyWordsBtn.disabled = false;
        } else {
            readFromSelectionBtn.disabled = true;
            addToMyWordsBtn.disabled = true;
        }
        vocabPopup.style.display = 'none'; 
    }

    // --- Definition Fetching (Only called from myWordsList clicks) ---
    async function fetchAndShowDefinition(textToDefine, targetElement) { 
        console.log("Fetching definition for (from My Words list):", textToDefine);
        showLoading(true);
        vocabPopup.style.display = 'none'; 
        try {
            const response = await fetch('/get_definition', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: textToDefine })
            });
            if (!response.ok) { 
                 const errorData = await response.json().catch(() => ({error: "Unknown error structure from backend"}));
                throw new Error(errorData.error || `Definition fetch error: ${response.status}`);
            }
            const data = await response.json();
            vocabWordEl.textContent = data.selected_text || textToDefine;
            vocabDefinitionEl.textContent = data.definition || "No definition available.";
            
            let rect;
            if (targetElement && typeof targetElement.getBoundingClientRect === 'function') {
                 rect = targetElement.getBoundingClientRect();
            }

            if (rect) {
                vocabPopup.style.display = 'block';
                let popupX = window.pageXOffset + rect.right + 10; 
                let popupY = window.pageYOffset + rect.top;

                if (popupX + vocabPopup.offsetWidth > window.innerWidth - 5) {
                    popupX = window.pageXOffset + rect.left - vocabPopup.offsetWidth - 10; 
                }
                if (popupX < window.pageXOffset + 5) popupX = window.pageXOffset + 5;
                if (popupY + vocabPopup.offsetHeight > window.innerHeight - 5) {
                    popupY = window.innerHeight - vocabPopup.offsetHeight - 5 - window.pageYOffset;
                }
                if (popupY < window.pageYOffset + 5) popupY = window.pageYOffset + 5;
                
                vocabPopup.style.left = `${popupX}px`;
                vocabPopup.style.top = `${popupY}px`;
            } else {
                console.warn("No target element to position popup for My Words definition.");
            }
        } catch (error) { 
            console.error('Error getting definition:', error);
            displayError(`Definition error for "${textToDefine}": ${error.message}`);
        } finally {
            showLoading(false);
        }
    }

    document.addEventListener('mousedown', (event) => {
        if (!vocabPopup.contains(event.target) && !event.target.closest('#my-words-list li')) {
             vocabPopup.style.display = 'none';
        }
    });


    // --- TTS Button Event Listeners ---
    readBookBtn.addEventListener('click', () => {
        primeTTSEngine(); 
        if (currentBookText) {
            console.log("Read Book button clicked.");
            // TEST LINE:
            // speakText("Hello, this is a simple test from Google Chrome."); 
            speakText(currentBookText);
        }
    });

    readFromSelectionBtn.addEventListener('click', () => {
        primeTTSEngine();
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        if (selectedText && currentBookText) { 
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                let startIndex = 0;
                if (bookContentDiv.firstChild && bookContentDiv.firstChild.nodeType === Node.TEXT_NODE) {
                    const preSelectionRange = document.createRange();
                    preSelectionRange.setStart(bookContentDiv.firstChild, 0);
                    preSelectionRange.setEnd(range.startContainer, range.startOffset);
                    startIndex = preSelectionRange.toString().length;
                } else {
                    startIndex = currentBookText.indexOf(selectedText); 
                    if (startIndex === -1) { 
                        displayError("Could not determine starting point of selection.");
                        return; 
                    }
                }
                const textToReadFromPoint = currentBookText.substring(startIndex);
                speakText(textToReadFromPoint);
            } else { displayError("Could not get selection range."); }
        } else if (!currentBookText) { displayError("No book loaded."); } 
        else { displayError("No text selected."); }
    });

    pauseReadingBtn.addEventListener('click', pauseReading);
    resumeReadingBtn.addEventListener('click', resumeReading);
    stopReadingBtn.addEventListener('click', stopReading);


    // --- Speech Synthesis Functions ---
    function updateTTSButtonStates() {
        if (!speechSynthesis) return;
        const bookLoaded = currentBookText && currentBookText.length > 0;

        readBookBtn.disabled = !bookLoaded || (isReading && !isPaused); 
        pauseReadingBtn.disabled = !isReading || isPaused;
        resumeReadingBtn.disabled = !isReading || !isPaused; 
        stopReadingBtn.disabled = !isReading && !isPaused; 
        
        if (isReading && !isPaused) ttsStatusP.textContent = "Reading...";
        else if (isPaused) ttsStatusP.textContent = "Paused.";
        else if (bookLoaded) ttsStatusP.textContent = "Ready to read.";
        else ttsStatusP.textContent = "Load a book to enable reading controls.";
    }

    function speakText(textToSpeak) {
        console.log("speakText called. Text (first 100 chars): '", textToSpeak ? textToSpeak.substring(0,100) : "NULL", "'");
        
        if (!speechSynthesis) { 
            ttsStatusP.textContent = "TTS not available."; 
            console.error("speakText: SpeechSynthesis API not available!");
            return; 
        }
        if (!textToSpeak || textToSpeak.trim() === "") { 
            ttsStatusP.textContent = "Nothing to read."; 
            console.warn("speakText: textToSpeak is empty or null.");
            return; 
        }
        
        console.log("speakText: Cancelling previous speech (if any).");
        speechSynthesis.cancel(); 

        setTimeout(() => {
            if (speechSynthesis.pending || speechSynthesis.speaking) {
                 console.warn("TTS still active after initial cancel, trying cancel again before new speak.");
                 speechSynthesis.cancel(); 
            }

            console.log("speakText: Creating new SpeechSynthesisUtterance.");
            currentUtterance = new SpeechSynthesisUtterance(textToSpeak); 
            currentUtterance.lang = 'en-US'; 

            // Attempt to assign a specific voice
            if (availableVoices.length > 0) {
                let englishVoice = availableVoices.find(voice => voice.lang === 'en-US' && voice.localService === true); // Prefer local
                if (!englishVoice) {
                    englishVoice = availableVoices.find(voice => voice.lang === 'en-US'); // Fallback to any English
                }
                if (englishVoice) {
                    currentUtterance.voice = englishVoice;
                    console.log("speakText: Using voice:", englishVoice.name, englishVoice.lang);
                } else {
                    console.warn("speakText: No 'en-US' voice found. Using default.");
                }
            } else {
                console.warn("speakText: No voices available when creating utterance. Using default. Attempting to reload voices.");
                loadAndLogVoices(); // Try to load voices again if they weren't ready
            }

            currentUtterance.onstart = () => {
                console.log("TTS onstart: Utterance has started speaking.");
                isReading = true;
                isPaused = false;
                updateTTSButtonStates();
            };

            currentUtterance.onend = () => {
                console.log("TTS onend: Utterance has finished speaking.");
                isReading = false;
                isPaused = false;
                // currentUtterance = null; 
                updateTTSButtonStates();
            };

            currentUtterance.onerror = (event) => {
                console.error('TTS onerror - Error type:', event.error, 'Full event object:', event); 
                isReading = false;
                isPaused = false;
                ttsStatusP.textContent = `Speech error: ${event.error}. See console for details.`;
                // currentUtterance = null;
                updateTTSButtonStates();
            };
            
            console.log("speakText: Attempting to speak with utterance object:", currentUtterance);
            if (currentUtterance instanceof SpeechSynthesisUtterance) {
                try {
                    speechSynthesis.speak(currentUtterance); 
                    isReading = true; 
                    isPaused = false;
                    updateTTSButtonStates(); 
                } catch (e) {
                    console.error("Error directly from speechSynthesis.speak():", e);
                    ttsStatusP.textContent = `Speech system error: ${e.message}.`;
                    isReading = false;
                    isPaused = false;
                    updateTTSButtonStates();
                }
            } else {
                console.error("speakText: currentUtterance is NOT a SpeechSynthesisUtterance object just before speak()!", currentUtterance);
                ttsStatusP.textContent = "Internal error: Could not prepare speech.";
                isReading = false;
                isPaused = false;
                updateTTSButtonStates();
            }
        }, 100); // 100ms delay
    }

    function stopReading() {
        if (speechSynthesis) {
            console.log("stopReading called.");
            speechSynthesis.cancel(); 
            isReading = false;
            isPaused = false;
            currentUtterance = null; 
            updateTTSButtonStates();
        }
    }
    function pauseReading() {
        if (speechSynthesis && speechSynthesis.speaking && !isPaused) {
            console.log("pauseReading called.");
            speechSynthesis.pause();
            isPaused = true;
            updateTTSButtonStates();
        }
    }
    function resumeReading() {
        if (speechSynthesis && isPaused) { // Check our internal isPaused flag
            console.log("resumeReading called.");
            speechSynthesis.resume();
            isPaused = false; 
            updateTTSButtonStates();
        }
    }

    // Initializations
    populateBookSelect();
    loadMyWords();
    updateTTSButtonStates();
    readFromSelectionBtn.disabled = true; 
    addToMyWordsBtn.disabled = true;
    console.log("Initial setup complete. TTS debugging enhanced.");
});
