import os
import re
import requests
from flask import Flask, render_template, jsonify, request # Removed send_from_directory as it's usually not needed
from dotenv import load_dotenv
import google.generativeai as genai

load_dotenv()

app = Flask(__name__)

print("Flask App Initializing...")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    print("CRITICAL ERROR: GEMINI_API_KEY not found in .env file or environment variables.")
else:
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        print("Gemini API configured successfully.")
    except Exception as e:
        print(f"CRITICAL ERROR: Failed to configure Gemini API: {e}")


GUTENBERG_START_MARKERS = [
    "*** START OF THIS PROJECT GUTENBERG EBOOK",
    "*** START OF THE PROJECT GUTENBERG EBOOK",
    "*END THE SMALL PRINT! FOR PUBLIC DOMAIN EBOOKS*",
]
GUTENBERG_END_MARKERS = [
    "*** END OF THIS PROJECT GUTENBERG EBOOK",
    "*** END OF THE PROJECT GUTENBERG EBOOK",
    "End of the Project Gutenberg EBook",
    "End of Project Gutenberg's",
]

def clean_gutenberg_text(text):
    print("clean_gutenberg_text: Starting cleaning...")
    lines = text.splitlines()
    start_index = 0
    end_index = len(lines)
    best_start_index = -1

    for i, line in enumerate(lines):
        if any(marker.lower() in line.lower() for marker in GUTENBERG_START_MARKERS):
            if "FOR PUBLIC DOMAIN EBOOKS" in line.upper() and best_start_index == -1:
                 best_start_index = i + 1 
            else:
                best_start_index = i + 1
                if "*** START OF TH" in line.upper():
                    break 
    
    if best_start_index != -1:
        start_index = best_start_index
        print(f"clean_gutenberg_text: Found start marker at line {start_index}")
    else:
        print("clean_gutenberg_text: No clear start marker found, using heuristic.")
        potential_header_lines = 0
        for i, line in enumerate(lines):
            if line.strip() == "":
                potential_header_lines +=1
            elif len(line.split()) > 10: # First line with substantial words
                start_index = i
                break
            potential_header_lines +=1
            if potential_header_lines > 50: # Avoid skipping too much if no clear start
                start_index = 0 # Default to beginning if no good heuristic
                break
        if start_index == 0 and len(lines) > 50: # A basic fallback if no marker
            start_index = min(20, len(lines) // 10) # Skip first 10% or 20 lines
        print(f"clean_gutenberg_text: Heuristic start_index: {start_index}")


    for i in range(len(lines) - 1, start_index -1, -1): # Iterate backwards from end
        line = lines[i]
        if any(marker.lower() in line.lower() for marker in GUTENBERG_END_MARKERS):
            end_index = i
            print(f"clean_gutenberg_text: Found end marker at line {end_index}")
            break
    
    if end_index == len(lines): # No end marker found after start_index
        print("clean_gutenberg_text: No specific end marker found after content start.")

    cleaned_lines = lines[start_index:end_index]
    content = "\n".join(cleaned_lines)
    content = re.sub(r'(\r\n|\r|\n){3,}', '\n\n', content) # Reduce multiple newlines to two
    content = content.strip()
    print(f"clean_gutenberg_text: Original length: {len(text)}, Cleaned length: {len(content)}")
    
    if len(content) < 200 and len(text) > 1000 : # If cleaning results in very short text from a long original
        print(f"Warning: Cleaned text is very short. Original len: {len(text)}, cleaned len: {len(content)}. Returning original as fallback for safety.")
        return text # Fallback to original if cleaning is too aggressive or fails

    return content if content else text # Return original if cleaning resulted in empty


@app.route('/')
def index():
    print("Route / : Serving index.html")
    return render_template('index.html')

@app.route('/fetch_book/<book_id>')
def fetch_book_text(book_id):
    print(f"Route /fetch_book/{book_id}: Received request.")
    primary_url = f"https://www.gutenberg.org/files/{book_id}/{book_id}-0.txt"
    # For non-digit IDs, or IDs that don't fit the /files/X/X-0.txt pattern
    if not book_id.isdigit() or not primary_url.endswith("-0.txt"): 
         primary_url = f"https://www.gutenberg.org/ebooks/{book_id}.txt.utf-8"

    urls_to_try = [primary_url]
    # Add alternative URLs for numeric IDs that might use the /cache/epub pattern
    if book_id.isdigit():
        urls_to_try.append(f"https://www.gutenberg.org/cache/epub/{book_id}/pg{book_id}.txt")
    # For non-digit IDs (e.g. fr10), try the cache/epub pattern as well
    elif not book_id.isdigit():
         urls_to_try.append(f"https://www.gutenberg.org/cache/epub/{book_id}/pg{book_id}.txt")


    text_content = None
    final_url_used = ""
    last_error = None

    for i, url in enumerate(urls_to_try):
        print(f"Attempting to fetch book from URL ({i+1}/{len(urls_to_try)}): {url}")
        try:
            response = requests.get(url, timeout=20)
            print(f"Gutenberg response status: {response.status_code} for {url}")
            response.raise_for_status() # Raises HTTPError for bad responses (4XX or 5XX)
            
            try:
                text_content = response.content.decode('utf-8')
                print("Successfully decoded as UTF-8.")
            except UnicodeDecodeError:
                print("UTF-8 decoding failed, trying Latin-1.")
                text_content = response.content.decode('latin-1', errors='replace')
                print("Successfully decoded as Latin-1 with replacements.")
            final_url_used = url
            break # Success, exit loop
        except requests.exceptions.HTTPError as e:
            print(f"HTTPError fetching {url}: {e}")
            last_error = e
            if e.response.status_code == 404:
                print(f"Book not found at {url} (404).")
                continue # Try next URL if 404
            else: # Other HTTP error, likely fatal for this attempt
                return jsonify({"error": f"Could not fetch book from {url}. HTTP Error: {e}"}), 500
        except requests.exceptions.RequestException as e:
            print(f"RequestException fetching {url}: {e}")
            last_error = e
            continue # Try next URL on other request exceptions too
    
    if not text_content:
        print(f"Failed to fetch book {book_id} from all attempted URLs. Last error: {last_error}")
        return jsonify({"error": f"Could not fetch book. Please check ID. Tried URLs: {', '.join(urls_to_try)}"}), 500

    print(f"Successfully fetched from: {final_url_used}")
    cleaned_text = clean_gutenberg_text(text_content)
    
    if not cleaned_text:
        print(f"Warning: clean_gutenberg_text returned empty for book {book_id}. Sending original content.")
        return jsonify({"text": text_content[:50000]}) 

    print(f"Route /fetch_book/{book_id}: Returning cleaned text. Length: {len(cleaned_text)}. First 100 chars: '{cleaned_text[:100]}'")
    return jsonify({"text": cleaned_text})


@app.route('/get_definition', methods=['POST'])
def get_definition():
    if not GEMINI_API_KEY:
        print("CRITICAL: /get_definition called but GEMINI_API_KEY is missing.")
        return jsonify({"error": "Gemini API key not configured on server."}), 500
        
    data = request.get_json()
    text_to_define = data.get('text')
    print(f"Route /get_definition: Received request for text: '{text_to_define}'")

    if not text_to_define:
        print("/get_definition: No text provided in request.")
        return jsonify({"error": "No text provided for definition"}), 400

    try:
        model = genai.GenerativeModel('gemini-1.5-flash-latest')
        
        # --- NEW PROMPT ---
        # This prompt explicitly asks for a JSON response, which is much more reliable.
        prompt = f"""
        Analyze the following English text: "{text_to_define}"

        Provide a vocabulary analysis. Respond ONLY with a valid JSON object.
        Do not add any explanation or markdown formatting like ```json.
        The JSON object must have the following keys: "definition", "synonyms", "antonyms", "turkish_meaning".

        - "definition": A concise definition of the text.
        - "synonyms": A list of up to 5 relevant synonyms.
        - "antonyms": A list of up to 5 relevant antonyms.
        - "turkish_meaning": The closest single word or short phrase Turkish equivalent.

        If a field is not applicable or cannot be found (e.g., no antonyms for a proper noun),
        return an empty list [] for "synonyms" and "antonyms", or an empty string "" for other fields.

        Example for the word "happy":
        {{
          "definition": "Feeling or showing pleasure or contentment.",
          "synonyms": ["content", "joyful", "cheerful", "pleased", "gleeful"],
          "antonyms": ["sad", "unhappy", "miserable", "depressed"],
          "turkish_meaning": "mutlu"
        }}
        """
        
        print(f"/get_definition: Sending JSON-focused prompt to Gemini for '{text_to_define}'")
        
        response = model.generate_content(prompt)
        
        # --- NEW PARSING LOGIC ---
        # Get the raw text from Gemini's response
        raw_response_text = ""
        if hasattr(response, 'text') and response.text:
            raw_response_text = response.text.strip()
        elif hasattr(response, 'parts') and response.parts:
            raw_response_text = "".join(part.text for part in response.parts if hasattr(part, 'text')).strip()
        
        print(f"/get_definition: Raw response from Gemini:\n{raw_response_text}")

        # Try to parse the raw text as JSON
        try:
            # Clean up potential markdown formatting that the AI might add despite instructions
            cleaned_json_string = re.sub(r'^```json\s*|\s*```$', '', raw_response_text, flags=re.MULTILINE)
            result_data = json.loads(cleaned_json_string)

            # Ensure all keys are present, providing default values if not
            final_json = {
                "selected_text": text_to_define,
                "definition": result_data.get("definition", "N/A"),
                "synonyms": result_data.get("synonyms", []),
                "antonyms": result_data.get("antonyms", []),
                "turkish_meaning": result_data.get("turkish_meaning", "N/A")
            }
            print(f"/get_definition: Successfully parsed JSON. Sending structured data to frontend.")
            return jsonify(final_json)

        except (json.JSONDecodeError, AttributeError) as e:
            print(f"Warning: Could not parse Gemini response as JSON for '{text_to_define}'. Error: {e}. Sending raw text as fallback definition.")
            # Fallback: if JSON parsing fails, just send the whole raw text as the definition.
            return jsonify({
                "selected_text": text_to_define,
                "definition": raw_response_text if raw_response_text else "Could not generate a definition.",
                "synonyms": [],
                "antonyms": [],
                "turkish_meaning": ""
            })

    except Exception as e:
        print(f"CRITICAL ERROR in /get_definition with Gemini API: {e}")
        return jsonify({"error": f"An unexpected error occurred with the AI service. Details: {str(e)}"}), 500

if __name__ == '__main__':
    print("Starting Flask development server...")
    # For local development, use_reloader=False can sometimes make debugging simpler if it auto-restarts too much
    # For Render, Gunicorn will handle how the app is run.
    app.run(debug=True, use_reloader=False) 

