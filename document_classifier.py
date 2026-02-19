"""
Document Classifier Module
Classifies documents as LOA, COVER_LETTER, ID_DOCUMENT, or OTHER
Uses filename patterns first, then AWS Bedrock for unmatched files
"""

import re
import json
import boto3
from typing import Optional, Dict, Tuple

# Classification patterns (Tier 1 - filename based)
PATTERNS = {
    'LOA': [
        r'loa\.pdf$',
        r'fac\s*loa',
        r'letter.*of.*authority',
        r'-\s*loa\b',
        r'\bloa\b.*\.pdf$',
    ],
    'COVER_LETTER': [
        r'cover\s*letter',
        r'covering\s*letter',
        r'client\s*care\s*letter',
        r'care\s*letter',
    ],
    'ID_DOCUMENT': [
        r'passport',
        r'driving.*licen[cs]e',
        r'\bid[\s_-]+(doc|document|card)?\b',
        r'identity',
        r'proof.*of.*id',
    ],
    'COMPLAINT': [
        r'complaint',
        r'fos\b',  # Financial Ombudsman Service
    ],
}

# File extensions for ID documents (images)
ID_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff']

class DocumentClassifier:
    def __init__(self, lenders_file: str = 'all_lenders_details.json', use_bedrock: bool = True):
        """
        Initialize classifier with lender data and Bedrock client

        Args:
            lenders_file: Path to all_lenders_details.json
            use_bedrock: Whether to use Bedrock for AI classification
        """
        self.lenders = self._load_lenders(lenders_file)
        self.lender_names = [l['lender'].upper() for l in self.lenders]
        self.use_bedrock = use_bedrock

        if use_bedrock:
            self.bedrock_client = boto3.client(
                'bedrock-runtime',
                region_name='eu-west-1'  # Bedrock available in eu-west-1
            )

    def _load_lenders(self, filepath: str) -> list:
        """Load lender data from JSON file"""
        try:
            with open(filepath, 'r') as f:
                return json.load(f)
        except FileNotFoundError:
            print(f"Warning: {filepath} not found, lender matching disabled")
            return []

    def classify_by_filename(self, filename: str) -> Tuple[str, float]:
        """
        Classify document based on filename patterns

        Returns:
            Tuple of (classification, confidence)
        """
        normalized = filename.lower()

        # Check each category's patterns
        for category, patterns in PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, normalized, re.IGNORECASE):
                    return (category, 0.9)

        # Check if it's an image file (likely ID document)
        ext = '.' + filename.split('.')[-1].lower() if '.' in filename else ''
        if ext in ID_IMAGE_EXTENSIONS:
            # Images with 'id' in name are likely ID documents
            if re.search(r'\bid\b', normalized):
                return ('ID_DOCUMENT', 0.85)

        return ('UNKNOWN', 0.0)

    def extract_lender_from_filename(self, filename: str) -> Optional[str]:
        """
        Try to extract lender name from filename

        Examples:
            - "Samiha Abdala Ahmed loa Capital One.pdf" -> "CAPITAL ONE"
            - "COMPLAINT NI Capital One 208838314.pdf" -> "CAPITAL ONE"
        """
        normalized = filename.upper()

        # Check each known lender name
        for lender_name in self.lender_names:
            # Escape special regex chars in lender name
            escaped = re.escape(lender_name)
            if re.search(r'\b' + escaped + r'\b', normalized):
                return lender_name

        # Try common patterns
        # Pattern: "loa {LenderName}.pdf"
        match = re.search(r'loa\s+([A-Za-z\s]+)\.pdf$', filename, re.IGNORECASE)
        if match:
            potential_lender = match.group(1).strip().upper()
            # Fuzzy match against known lenders
            best_match = self._fuzzy_match_lender(potential_lender)
            if best_match:
                return best_match

        return None

    def _fuzzy_match_lender(self, text: str) -> Optional[str]:
        """
        Fuzzy match text against known lender names
        Returns best match if similarity > 80%
        """
        text = text.upper()

        # Direct substring match
        for lender in self.lender_names:
            if text in lender or lender in text:
                return lender

        # Word overlap match
        text_words = set(text.split())
        for lender in self.lender_names:
            lender_words = set(lender.split())
            overlap = len(text_words & lender_words)
            if overlap > 0 and overlap >= len(lender_words) * 0.5:
                return lender

        return None

    def classify_with_bedrock(self, text_content: str, filename: str) -> Dict:
        """
        Use AWS Bedrock Claude to classify document

        Args:
            text_content: Extracted text from document (first 2000 chars)
            filename: Original filename

        Returns:
            Dict with 'type', 'lender', 'confidence'
        """
        if not self.use_bedrock:
            return {'type': 'OTHER', 'lender': None, 'confidence': 0.5}

        prompt = f"""Classify this document based on its filename and content.

Filename: {filename}
Content (first 2000 chars): {text_content[:2000] if text_content else 'No text extracted'}

Categories:
- LOA: Letter of Authority, authorization letter for claims
- COVER_LETTER: Cover letter, client care letter, accompanying letter
- ID_DOCUMENT: Passport, driving license, ID card, proof of identity
- COMPLAINT: Complaint letter, FOS complaint
- OTHER: Any other document type

Also extract the lender/company name if this is a financial document (e.g., Capital One, Vanquis, HSBC).

Respond with ONLY a JSON object in this exact format:
{{"type": "CATEGORY", "lender": "LENDER_NAME or null", "confidence": 0.0-1.0}}"""

        try:
            response = self.bedrock_client.invoke_model(
                modelId='anthropic.claude-3-haiku-20240307-v1:0',  # Fast and cheap
                body=json.dumps({
                    'anthropic_version': 'bedrock-2023-05-31',
                    'max_tokens': 200,
                    'messages': [{
                        'role': 'user',
                        'content': prompt
                    }]
                }),
                contentType='application/json'
            )

            response_body = json.loads(response['body'].read())
            result_text = response_body['content'][0]['text']

            # Parse JSON from response
            json_match = re.search(r'\{[^}]+\}', result_text)
            if json_match:
                result = json.loads(json_match.group())
                return {
                    'type': result.get('type', 'OTHER').upper(),
                    'lender': result.get('lender'),
                    'confidence': float(result.get('confidence', 0.7))
                }
        except Exception as e:
            print(f"Bedrock classification error: {e}")

        return {'type': 'OTHER', 'lender': None, 'confidence': 0.5}

    def classify(self, filename: str, text_content: str = None) -> Dict:
        """
        Main classification method - tries filename first, then AI

        Args:
            filename: Document filename
            text_content: Optional extracted text content

        Returns:
            Dict with 'type', 'lender', 'confidence', 'method'
        """
        # Tier 1: Filename classification
        doc_type, confidence = self.classify_by_filename(filename)
        lender = self.extract_lender_from_filename(filename)

        if doc_type != 'UNKNOWN':
            return {
                'type': doc_type,
                'lender': lender,
                'confidence': confidence,
                'method': 'filename'
            }

        # Tier 2: AI classification (if enabled and we have content)
        if self.use_bedrock and text_content:
            ai_result = self.classify_with_bedrock(text_content, filename)
            ai_result['method'] = 'bedrock'
            # Use AI-extracted lender if we didn't find one in filename
            if not lender and ai_result.get('lender'):
                # Validate against known lenders
                ai_result['lender'] = self._fuzzy_match_lender(ai_result['lender'])
            elif lender:
                ai_result['lender'] = lender
            return ai_result

        # Default to OTHER
        return {
            'type': 'OTHER',
            'lender': lender,
            'confidence': 0.5,
            'method': 'default'
        }


# Test the classifier
if __name__ == '__main__':
    classifier = DocumentClassifier(use_bedrock=False)  # Test without Bedrock

    test_files = [
        '980867873-CA FAC LOA.pdf',
        'Samiha Abdala Ahmed loa Capital One.pdf',
        'mathew id.jpeg',
        'COMPLAINT NI Capital One 208838314.pdf',
        'CLIENT CARE LETTER.pdf',
        'random_document.pdf',
        'passport_scan.jpg',
        'driving_licence_front.png',
    ]

    print("Document Classification Test")
    print("=" * 60)
    for filename in test_files:
        result = classifier.classify(filename)
        print(f"{filename}")
        print(f"  -> {result['type']} (confidence: {result['confidence']}, lender: {result['lender']})")
        print()
