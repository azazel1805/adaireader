document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded and parsed. Version: Vocabulary Popup with Synonyms/Antonyms/Turkish.");

    // --- Element getters ---
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
    const loadingIndicator = document.getElementById('loading-indicator');
    const errorMessageDiv = document.getElementById('error-message');
    
    // **NEW** Getters for the enhanced vocabulary popup
    const vocabDefinitionEl = document.getElementById('vocab-definition');
    const vocabSynonymsEl = document.getElementById('vocab-synonyms');
    const vocabAntonymsEl = document.getElementById('vocab-antonyms');
    const vocabTurkishEl = document.getElementById('vocab-turkish');
    const vocabEntryDefinition = document.getElementById('vocab-entry-definition');
    const vocabEntrySynonyms = document.getElementById('vocab-entry-synonyms');
    const vocabEntryAntonyms = document.getElementById('vocab-entry-antonyms');
    const vocabEntryTurkish = document.getElementById('vocab-entry-turkish');


    // --- Essential Elements Check ---
    const essentialElements = [
        bookSelect, bookIdInput, loadBookBtn, bookContentDiv, addToMyWordsBtn,
        readFromSelectionBtn, myWordsListUl, readBookBtn, pauseReadingBtn,
        resumeReadingBtn, stopReadingBtn, ttsStatusP, vocabPopup, vocabWordEl,
        loadingIndicator, errorMessageDiv,
        // **NEW** Add new elements to the check
        vocabDefinitionEl, vocabSynonymsEl, vocabAntonymsEl, vocabTurkishEl,
        vocabEntryDefinition, vocabEntrySynonyms, vocabEntryAntonyms, vocabEntryTurkish
    ];

    if (essentialElements.some(el => el === null)) {
        console.error("One or more essential DOM elements are missing. Please check your HTML structure.");
        document.body.innerHTML = '<h1>Error: Page elements missing. Please check console.</h1>';
        return; 
    }

    // --- Global State Variables ---
    let currentBookText = "";
    let isReading = false; 
    let isPaused = false;
    let speechSynthesis = window.speechSynthesis;
    let currentUtterance = null;
    let utteranceQueue = [];
    let currentChunkIndex = 0;
    let myWords = []; 
    let availableVoices = [];

    // --- TTS Engine Priming & Voice Loading ---
    let ttsEnginePrimed = false;
    function primeTTSEngine() {
        if (!ttsEnginePrimed && speechSynthesis && availableVoices.length > 0) { 
            console.log("Priming TTS Engine for Chrome...");
            const primer = new SpeechSynthesisUtterance('Hello'); 
            primer.volume = 0.01;
            primer.rate = 5;
            const englishVoice = availableVoices.find(voice => voice.lang.startsWith('en-') && voice.localService === true) || availableVoices.find(voice => voice.lang.startsWith('en-'));
            if (englishVoice) primer.voice = englishVoice;
            primer.onend = () => { ttsEnginePrimed = true; console.log("TTS Primer ended."); };
            primer.onerror = (event) => console.error("TTS Primer error:", event.error);
            try { speechSynthesis.speak(primer); } catch (e) { console.error("Error speaking primer:", e); }
        } else if (!ttsEnginePrimed && speechSynthesis) {
            loadAndLogVoices();
        }
    }
    
    function loadAndLogVoices() {
        if (!speechSynthesis) return;
        availableVoices = speechSynthesis.getVoices();
        if (availableVoices.length === 0 && speechSynthesis.onvoiceschanged === null) {
            speechSynthesis.onvoiceschanged = () => {
                availableVoices = speechSynthesis.getVoices();
                console.log("TTS voices loaded (onvoiceschanged):", availableVoices);
                primeTTSEngine();
            };
        }
    }

    if (!speechSynthesis) {
        console.warn("SpeechSynthesis API not available.");
        if(ttsStatusP) ttsStatusP.textContent = "TTS not supported.";
        [readBookBtn, pauseReadingBtn, resumeReadingBtn, stopReadingBtn, readFromSelectionBtn].forEach(btn => btn.disabled = true);
    } else {
        speechSynthesis.cancel();
        loadAndLogVoices();
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
                console.error("Error parsing 'myGutenbergWords':", e);
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
            displayError("Selected text is too long for 'My Words'.");
        }
    }
    function renderMyWordsList() { 
        myWordsListUl.innerHTML = '';
        if (myWords.length === 0) {
            myWordsListUl.innerHTML = '<li>Your saved words will appear here.</li>';
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
            displayError("No text selected to add.");
        }
    });

    // --- Predefined Book List ---
    const preselectedBooks = [ 
        { title: "Alice's Adventures in Wonderland", id: "11" },
        { title: "Pride and Prejudice", id: "1342" },
        { title: "The Adventures of Sherlock Holmes", id: "1661" },
        { title: "A Tale of Two Cities", id: "98" },
        { title: "Moby Dick", id: "2701" },
        { title: "Frankenstein", id: "84" },
        { title: "Dracula", id: "345" },
        { title: "The Picture of Dorian Gray", id: "174" },
        { title: "The Great Gatsby", id: "64317" },
        { title: "Jane Eyre", id: "1260" }
        // ... you can add more books here
    ];

    function populateBookSelect() { 
        preselectedBooks.forEach(book => {
            const option = document.createElement('option');
            option.value = book.id;
            option.textContent = book.title;
            bookSelect.appendChild(option);
        });
    }
    
    // --- Helper Functions ---
    function displayError(message) { 
        console.error("User Error:", message);
        errorMessageDiv.textContent = message;
        errorMessageDiv.style.display = 'block';
        setTimeout(() => { errorMessageDiv.style.display = 'none'; }, 7000);
    }
    function showLoading(show) { 
        loadingIndicator.style.display = show ? 'block' : 'none';
    }

    // --- Book Loading ---
    bookSelect.addEventListener('change', () => { 
        if (bookSelect.value) bookIdInput.value = bookSelect.value;
    });
    loadBookBtn.addEventListener('click', loadBook);
    bookIdInput.addEventListener('keypress', (event) => { 
        if (event.key === 'Enter') loadBook();
    });
    async function loadBook() { 
        primeTTSEngine();
        const bookId = bookIdInput.value.trim();
        if (!bookId) { 
            displayError("Please select or enter a Book ID.");
            return; 
        }
        showLoading(true);
        bookContentDiv.innerHTML = '<p>Loading book...</p>';
        currentBookText = "";
        stopReading();
        try {
            const response = await fetch(`/fetch_book/${bookId}`);
            if (!response.ok) { 
                const errorData = await response.json().catch(() => ({error: "Unknown server error"}));
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            currentBookText = data.text || "";
            displayBookText(currentBookText);
        } catch (error) { 
            console.error('Error loading book:', error);
            displayError(`Failed to load book: ${error.message}`);
            bookContentDiv.innerHTML = '<p>Failed to load book.</p>';
        }
        finally {
            showLoading(false);
            updateTTSButtonStates();
        }
    }
    function displayBookText(text) { 
        bookContentDiv.textContent = text;
    }

    // --- Text Selection Handling ---
    bookContentDiv.addEventListener('mouseup', handleBookTextSelection);
    function handleBookTextSelection(event) {
        const selectedText = window.getSelection().toString().trim();
        readFromSelectionBtn.disabled = !selectedText;
        addToMyWordsBtn.disabled = !selectedText;
        vocabPopup.style.display = 'none'; 
    }

    // --- Definition Fetching (REPLACED/UPDATED) ---
    async function fetchAndShowDefinition(textToDefine, targetElement) { 
        console.log("Fetching enhanced definition for:", textToDefine);
        showLoading(true);
        vocabPopup.style.display = 'none'; 
        try {
            const response = await fetch('/get_definition', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: textToDefine })
            });
            if (!response.ok) { 
                const errorData = await response.json().catch(() => ({error: "Unknown error from backend"}));
                throw new Error(errorData.error || `Definition fetch error: ${response.status}`);
            }
            const data = await response.json();
            
            // --- NEW POPUP POPULATION LOGIC ---

            // Set the main word
            vocabWordEl.textContent = data.selected_text || textToDefine;

            // Populate Definition
            if (data.definition && data.definition.trim() !== "N/A") {
                vocabDefinitionEl.textContent = data.definition;
                vocabEntryDefinition.style.display = 'block';
            } else {
                vocabEntryDefinition.style.display = 'none';
            }

            // Populate Synonyms
            if (data.synonyms && data.synonyms.length > 0) {
                vocabSynonymsEl.textContent = data.synonyms.join(', ');
                vocabEntrySynonyms.style.display = 'block';
            } else {
                vocabEntrySynonyms.style.display = 'none';
            }

            // Populate Antonyms
            if (data.antonyms && data.antonyms.length > 0) {
                vocabAntonymsEl.textContent = data.antonyms.join(', ');
                vocabEntryAntonyms.style.display = 'block';
            } else {
                vocabEntryAntonyms.style.display = 'none';
            }

            // Populate Turkish Meaning
            if (data.turkish_meaning && data.turkish_meaning.trim() && data.turkish_meaning.trim() !== "N/A") {
                vocabTurkishEl.textContent = data.turkish_meaning;
                vocabEntryTurkish.style.display = 'block';
            } else {
                vocabEntryTurkish.style.display = 'none';
            }
            
            // Position and display the popup
            const rect = targetElement ? targetElement.getBoundingClientRect() : null;

            if (rect) {
                vocabPopup.style.display = 'block';
                let popupX = window.pageXOffset + rect.right + 10; 
                let popupY = window.pageYOffset + rect.top;

                // Simple boundary checks to keep popup on screen
                if ((popupX + vocabPopup.offsetWidth) > window.innerWidth) {
                    popupX = window.pageXOffset + rect.left - vocabPopup.offsetWidth - 10; 
                }
                if (popupX < 5) popupX = 5;
                
                vocabPopup.style.left = `${popupX}px`;
                vocabPopup.style.top = `${popupY}px`;
            } else {
                console.warn("No target element to position popup.");
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
        if (currentBookText) speakText(currentBookText);
        else displayError("No book loaded to read.");
    });

    readFromSelectionBtn.addEventListener('click', () => {
        primeTTSEngine();
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        if (selectedText && currentBookText) { 
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                let startIndex = currentBookText.indexOf(selectedText); 
                if (startIndex === -1) { 
                    displayError("Could not determine start point. Reading selection only.");
                    speakText(selectedText);
                    return;
                }
                speakText(currentBookText.substring(startIndex));
            } else { displayError("Could not get selection range."); }
        } else if (!currentBookText) { displayError("No book loaded."); } 
        else { displayError("No text selected."); }
    });

    pauseReadingBtn.addEventListener('click', pauseReading);
    resumeReadingBtn.addEventListener('click', resumeReading);
    stopReadingBtn.addEventListener('click', stopReading);

    // --- Speech Synthesis Functions ---
    function splitTextIntoChunks(text, maxChunkLength = 250) {
        const chunks = [];
        const paragraphs = text.split(/[\r\n]{2,}/).filter(p => p.trim());
        for (const para of paragraphs) {
            let currentChunk = '';
            const sentences = para.match(/[^.!?]+[.!?]*/g) || [para];
            for (const sentence of sentences) {
                if ((currentChunk + sentence).length <= maxChunkLength) {
                    currentChunk += sentence;
                } else {
                    if (currentChunk.trim()) chunks.push(currentChunk.trim());
                    currentChunk = sentence;
                }
            }
            if (currentChunk.trim()) chunks.push(currentChunk.trim());
        }
        return chunks;
    }

    function speakNextChunk() {
        if (!isReading || isPaused) return;

        if (currentChunkIndex < utteranceQueue.length) {
            const chunk = utteranceQueue[currentChunkIndex];
            currentUtterance = new SpeechSynthesisUtterance(chunk);
            currentUtterance.lang = 'en-US'; 
            if (availableVoices.length > 0) {
                const englishVoice = availableVoices.find(v => v.lang.startsWith('en-') && v.localService) || availableVoices.find(v => v.lang.startsWith('en-'));
                if (englishVoice) currentUtterance.voice = englishVoice;
            }
            currentUtterance.onend = () => { currentChunkIndex++; speakNextChunk(); };
            currentUtterance.onerror = (e) => { displayError(`Speech error: ${e.error}`); stopReading(); };
            try { speechSynthesis.speak(currentUtterance); } catch (e) { displayError(`Speech system error: ${e.message}.`); stopReading(); }
        } else {
            console.log("All chunks spoken.");
            stopReading();
        }
    }

    function speakText(textToSpeak) {
        if (!speechSynthesis) { displayError("TTS not available."); return; }
        if (!textToSpeak || !textToSpeak.trim()) { displayError("Nothing to read."); return; }
        
        stopReading();
        utteranceQueue = splitTextIntoChunks(textToSpeak);
        currentChunkIndex = 0;

        if (utteranceQueue.length === 0) { displayError("No readable content found."); return; }

        isReading = true;
        isPaused = false;
        updateTTSButtonStates();
        speakNextChunk();
    }

    function stopReading() {
        if (speechSynthesis) {
            speechSynthesis.cancel(); 
            isReading = false;
            isPaused = false;
            currentUtterance = null; 
            utteranceQueue = [];
            currentChunkIndex = 0;
            updateTTSButtonStates();
        }
    }
    function pauseReading() {
        if (speechSynthesis && speechSynthesis.speaking && !isPaused) {
            speechSynthesis.pause();
            isPaused = true;
            updateTTSButtonStates();
        }
    }
    function resumeReading() {
        if (speechSynthesis && isPaused) { 
            speechSynthesis.resume();
            isPaused = false; 
            updateTTSButtonStates();
        }
    }

    function updateTTSButtonStates() {
        if (!speechSynthesis) {
            [readBookBtn, pauseReadingBtn, resumeReadingBtn, stopReadingBtn, readFromSelectionBtn].forEach(btn => btn.disabled = true);
            ttsStatusP.textContent = "TTS not supported.";
            return;
        }
        const bookLoaded = currentBookText.length > 0;
        readBookBtn.disabled = !bookLoaded || isReading;
        pauseReadingBtn.disabled = !isReading || isPaused;
        resumeReadingBtn.disabled = !isReading || !isPaused;
        stopReadingBtn.disabled = !isReading && !isPaused;
        readFromSelectionBtn.disabled = !window.getSelection().toString().trim() || isReading;

        if (isReading && !isPaused) ttsStatusP.textContent = "Reading...";
        else if (isPaused) ttsStatusP.textContent = "Paused.";
        else if (bookLoaded) ttsStatusP.textContent = "Ready to read.";
        else ttsStatusP.textContent = "Load a book to enable controls.";
    }

    // --- Initializations ---
    populateBookSelect();
    loadMyWords();
    updateTTSButtonStates();
    console.log("Initial setup complete with enhanced vocabulary feature.");
});
