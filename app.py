import os
import re
import requests
import json # <--- THIS IS THE FIX
from flask import Flask, render_template, jsonify, request
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
    else:
        # Heuristic fallback if no clear marker is found
        potential_header_lines = 0
        for i, line in enumerate(lines):
            if line.strip() == "": potential_header_lines +=1
            elif len(line.split()) > 10: start_index = i; break
            potential_header_lines +=1
            if potential_header_lines > 50: start_index = 0; break
        if start_index == 0 and len(lines) > 50: start_index = min(20, len(lines) // 10)

    for i in range(len(lines) - 1, start_index -1, -1):
        line = lines[i]
        if any(marker.lower() in line.lower() for marker in GUTENBERG_END_MARKERS):
            end_index = i
            break
    
    cleaned_lines = lines[start_index:end_index]
    content = "\n".join(cleaned_lines)
    content = re.sub(r'(\r\n|\r|\n){3,}', '\n\n', content).strip()
    
    if len(content) < 200 and len(text) > 1000:
        print(f"Warning: Cleaned text is very short. Returning original as fallback.")
        return text

    return content if content else text


@app.route('/')
def index():
    return render_template('index.html')

@app.route('/fetch_book/<book_id>')
def fetch_book_text(book_id):
    primary_url = f"https://www.gutenberg.org/files/{book_id}/{book_id}-0.txt"
    if not book_id.isdigit(): 
         primary_url = f"https://www.gutenberg.org/ebooks/{book_id}.txt.utf-8"

    urls_to_try = [primary_url]
    if book_id.isdigit():
        urls_to_try.append(f"https://www.gutenberg.org/cache/epub/{book_id}/pg{book_id}.txt")
    
    text_content, last_error = None, None
    for url in urls_to_try:
        try:
            response = requests.get(url, timeout=20)
            response.raise_for_status()
            try:
                text_content = response.content.decode('utf-8')
            except UnicodeDecodeError:
                text_content = response.content.decode('latin-1', errors='replace')
            break
        except requests.exceptions.RequestException as e:
            last_error = e
            continue
    
    if not text_content:
        return jsonify({"error": f"Could not fetch book. Please check ID. Last error: {last_error}"}), 500

    cleaned_text = clean_gutenberg_text(text_content)
    return jsonify({"text": cleaned_text or text_content})


@app.route('/get_definition', methods=['POST'])
def get_definition():
    if not GEMINI_API_KEY:
        return jsonify({"error": "Gemini API key not configured on server."}), 500
        
    data = request.get_json()
    text_to_define = data.get('text')
    if not text_to_define:
        return jsonify({"error": "No text provided for definition"}), 400

    try:
        model = genai.GenerativeModel('gemini-1.5-flash-latest')
        prompt = f"""
        Analyze the following English text: "{text_to_define}"
        Provide a vocabulary analysis. Respond ONLY with a valid JSON object.
        Do not add any explanation or markdown formatting like ```json.
        The JSON object must have the following keys: "definition", "synonyms", "antonyms", "turkish_meaning".
        - "definition": A concise definition of the text.
        - "synonyms": A list of up to 5 relevant synonyms.
        - "antonyms": A list of up to 5 relevant antonyms.
        - "turkish_meaning": The closest single word or short phrase Turkish equivalent.
        If a field is not applicable (e.g., no antonyms), return an empty list [] for "synonyms" and "antonyms", or an empty string "" for other fields.
        """
        
        response = model.generate_content(prompt)
        raw_response_text = ""
        if hasattr(response, 'text') and response.text:
            raw_response_text = response.text.strip()
        elif hasattr(response, 'parts') and response.parts:
            raw_response_text = "".join(part.text for part in response.parts if hasattr(part, 'text')).strip()
        
        print(f"/get_definition: Raw response from Gemini:\n{raw_response_text}")

        try:
            cleaned_json_string = re.sub(r'^```json\s*|\s*```$', '', raw_response_text, flags=re.MULTILINE)
            result_data = json.loads(cleaned_json_string)
            final_json = {
                "selected_text": text_to_define,
                "definition": result_data.get("definition", "N/A"),
                "synonyms": result_data.get("synonyms", []),
                "antonyms": result_data.get("antonyms", []),
                "turkish_meaning": result_data.get("turkish_meaning", "N/A")
            }
            return jsonify(final_json)
        except (json.JSONDecodeError, AttributeError) as e:
            print(f"Warning: Could not parse Gemini response as JSON for '{text_to_define}'. Error: {e}.")
            return jsonify({
                "selected_text": text_to_define,
                "definition": raw_response_text if raw_response_text else "Could not generate a definition.",
                "synonyms": [], "antonyms": [], "turkish_meaning": ""
            })

    except Exception as e:
        print(f"CRITICAL ERROR in /get_definition with Gemini API: {e}")
        return jsonify({"error": f"An unexpected error occurred with the AI service. Details: {str(e)}"}), 500


if __name__ == '__main__':
    app.run(debug=True, use_reloader=False)
