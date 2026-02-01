# 🎙️ Mime - Voice-Controlled Browser Automation

> Intelligent browser automation powered by voice commands and AI

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

## 🌟 What is Mime?

Mime is a **voice-controlled browser automation tool** built on top of [Automa](https://github.com/AutomaApp/automa). It combines AI-powered speech recognition with intelligent workflow execution to enable hands-free browser automation through natural language.

Mime adds **dynamic parameter extraction** to Automa workflows. Record a workflow once with a parameter (like "search golang on YouTube"), then execute it with any value by voice - say "search rust on YouTube" and Mime automatically extracts "rust" and uses it in place of "golang".

**Example:**
- 🎬 **Record once:** "search golang on YouTube" (with parameter)
- 🎤 **Say anything:** "search rust on YouTube"
- ⚡ **Mime extracts:** "rust" → replaces "golang" → executes workflow

One workflow, infinite variations - all controlled by your voice!

## ✨ Core Features

- � **Voice Control** - Execute workflows using natural language commands
- 🤖 **AI Speech Recognition** - Powered by OpenAI Whisper for accurate offline transcription
- � **Dynamic Parameters** - Automatically extract and inject parameters from spoken commands
- 📍 **Smart Execution** - Workflows run in the current tab for seamless browsing
- � **Multi-User Support** - UUID-based user isolation for shared environments
- 💾 **Command Management** - Save and organize voice commands per user
- 🔒 **Privacy-First** - Runs completely locally with no cloud dependencies
- 🏗️ **Microservices Architecture** - Scalable backend with Express + FastAPI

## 🏗️ How It Works

Mime uses a microservices architecture to process voice commands:

1. **Browser Extension** - Captures voice input and manages workflow execution
2. **Express Server** - Handles command matching and user management
3. **FastAPI Service** - Transcribes audio using OpenAI Whisper
4. **PostgreSQL Database** - Stores user commands and preferences

**Built on Automa:** Mime leverages Automa's powerful workflow engine and extends it with voice control, parameter extraction, and intelligent execution capabilities.

## 🚀 Quick Start

### Prerequisites

- **Node.js** 16+ and npm
- **Python** 3.8+
- **PostgreSQL** 12+
- **FFmpeg** (for audio processing)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/mime-voice-automation.git
   cd mime-voice-automation
   ```

2. **Set up Express server**
   ```bash
   cd backend/express
   npm install
   
   # Configure environment variables
   cp .env.example .env
   # Edit .env with your database credentials
   ```

3. **Set up FastAPI server**
   ```bash
   cd ../fastapi
   pip install -r requirements.txt
   ```

4. **Set up PostgreSQL database**
   ```bash
   # Create database
   createdb mime_db
   
   # Run schema (from project root)
   psql -d mime_db -f database-schema.sql
   ```

5. **Build browser extension**
   ```bash
   cd extension
   npm install --legacy-peer-deps
   npm run build
   ```

6. **Load extension in browser**
   - Open Chrome → `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select `extension/build` folder

### Running

**Option 1: Automated (Windows)**
```bash
start-all.bat
```

**Option 2: Manual**
```bash
# Terminal 1: Express server
cd backend/express
node server.js

# Terminal 2: FastAPI server
cd backend/fastapi
python mimeServer.py
```

### Usage

#### 🎬 Complete Example: YouTube Search with Voice

**What You'll Build:**
A workflow that searches YouTube for anything you say - just speak "search rust on youtube" and it searches for "rust"!

**Step 1: Record the Workflow**
1. Open Automa and click "Record"
2. Name it: `search golang on youtube`
3. Navigate to YouTube
4. Click in the search box
5. Press **Ctrl+Alt+P** (parameter recording starts)
6. Type `golang` (this is your example - will be replaced later)
7. Press **Ctrl+Alt+P** (parameter recording ends)
8. Press Enter to search
9. Click "Stop Recording"
10. Automa asks: "Parameter name?" → Enter `golang`
11. Done! Workflow saved automatically to Mime

**Step 2: Use It with Voice**

Now you can say ANY of these:
- 🎤 "search **rust** on youtube" → Searches for "rust"
- 🎤 "search **python tutorials** on youtube" → Searches for "python tutorials"
- 🎤 "search **web development** on youtube" → Searches for "web development"

**What Happens:**
1. You say: "search **rust** on youtube"
2. Mime extracts: `rust` (the part that's different from your saved command)
3. Replaces: `golang` → `rust` in the workflow
4. Executes: Workflow runs in current tab, searching for "rust"

**The Magic:** You recorded it ONCE with "golang", but now it works with ANY search term you speak! 🎯

---

#### 📝 How to Create Workflows

**For Static Workflows (no parameters):**
1. Record workflow in Automa (e.g., "open gmail")
2. Don't use Ctrl+Alt+P
3. Stop recording → automatically saved to Mime
4. Say "open gmail" → executes exactly as recorded

**For Dynamic Workflows (with parameters):**
1. Record workflow with a name like "search golang on youtube"
2. Use **Ctrl+Alt+P** to mark the part that should change
3. Type an example value between the Ctrl+Alt+P presses
4. Stop recording → enter parameter name
5. Say "search **anything** on youtube" → extracts and uses "anything"

---

#### 🧠 Intelligent Matching

Mime automatically detects whether your command is static or dynamic:

| You Say | Mime Does |
|---------|-----------|
| "open gmail" | Exact match → runs static workflow |
| "search rust on youtube" | Pattern match → extracts "rust" → runs with parameter |
| "send email to john" | Pattern match → extracts "john" → runs with parameter |

**Two-Step Matching:**
1. **First:** Checks for exact matches (static workflows)
2. **Then:** Checks for pattern matches (dynamic workflows with parameter extraction)

## 🛠️ Tech Stack

### Backend Infrastructure
- **API Server:** Node.js, Express.js
- **AI Service:** Python, FastAPI, OpenAI Whisper
- **Database:** PostgreSQL with UUID-based user isolation
- **Audio Processing:** FFmpeg, MediaRecorder API

### Frontend
- **Extension:** Vue.js 3, Browser Extension APIs
- **Base Framework:** Automa (extended with custom features)

### Architecture
- **Microservices:** Decoupled Express + FastAPI services
- **Real-time:** WebSocket-ready architecture
- **Scalable:** Horizontal scaling support

## 📁 Project Structure

```
mime-voice-automation/
├── extension/          # Browser extension (Vue.js)
├── backend/
│   ├── express/       # API server (Node.js)
│   └── fastapi/       # Whisper service (Python)
├── docs/              # Documentation
├── .gitignore
├── README.md
└── start-all.bat      # Startup script
```

## 🔧 Configuration

### Environment Variables

**backend/express/.env:**
```env
PORT=8000
WHISPER_SERVER=http://localhost:8001
DATABASE_USER=your_user
DATABASE_PASSWORD=your_password
DATABASE_NAME=mime_db
DATABASE_PORT=5432
```

## 🐛 Troubleshooting

**Issue:** "Microphone Permission Denied"  
**Solution:** 
1. Go to `chrome://extensions`
2. Find "Mime" extension
3. Click "Details"
4. Scroll to "Permissions"
5. Set **Microphone** to **"Allow"** (not "Ask")
6. Reload the extension

**Issue:** "Cannot connect to Whisper server"  
**Solution:** Ensure FastAPI server is running on port 8001
```bash
cd backend/fastapi
python mimeServer.py
```

**Issue:** "Database connection failed"  
**Solution:** 
- Check PostgreSQL is running
- Verify credentials in `backend/express/.env`
- Ensure database exists: `createdb mime_db`

**Issue:** "Speech recognition is slow"  
**Solution:** 
- Whisper performance depends on your hardware
- **With GPU:** ~2-5 seconds for transcription
- **Without GPU (CPU only):** ~20-30 seconds for transcription
- Consider using a smaller Whisper model (edit `backend/fastapi/mimeServer.py`)
  - ⚠️ **Note:** Smaller models are faster but less accurate
- GPU acceleration significantly improves speed without sacrificing accuracy

## ⚡ Performance Notes

**Speech Recognition Speed:**
- Mime uses OpenAI Whisper for speech-to-text conversion
- **GPU-enabled systems:** Fast transcription (~2-5 seconds)
- **CPU-only systems:** Slower transcription (~20-30 seconds)
- The demo video shows CPU performance - GPU systems will be much faster

**Recommendations:**
- For best experience, use a system with a dedicated GPU
- Alternatively, use a smaller Whisper model for faster CPU performance (may reduce accuracy)
- Speech recognition runs locally for privacy, so speed depends on your hardware
- **Tradeoff:** Smaller models = faster speed but lower transcription accuracy

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **[Automa](https://github.com/AutomaApp/automa)** - This project is built on Automa's excellent workflow engine. Mime extends Automa with voice control and additional automation features.
- **[OpenAI Whisper](https://github.com/openai/whisper)** - Powers the speech recognition capabilities
- **The Open Source Community** - For inspiration, tools, and support

---

**Mime is an independent community project built on top of Automa. It is not officially affiliated with or endorsed by the Automa project.**

## 📧 Contact

- **Issues:** [GitHub Issues](https://github.com/YOUR_USERNAME/mime-voice-automation/issues)
- **Discussions:** [GitHub Discussions](https://github.com/YOUR_USERNAME/mime-voice-automation/discussions)

---

**Built with ❤️ for the Automa community**
