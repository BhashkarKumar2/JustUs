# JustUs V2

**JustUs V2** is a modern, full-stack real-time chat application providing instant, secure, and smart communication. It leverages the MERN stack, enhances user experience with advanced features and a mobile-first design, and enables rich media and AI-powered interactions.

---

## Features

- **Real-time Messaging**: Instant text, voice, and media sharing powered by Socket.io.
- **AI Integration (Backend)**: Google Generative AI and OpenAI for smart responses and assistance.
- **Real-time Translation**: Instantly translates messages to break language barriers.
- **Secure Authentication**: Powered by JWT and bcrypt for robust user authentication.
- **Media Support**: Effortlessly upload and share files and media.
- **Responsive UI**: Built with TailwindCSS and designed mobile-first.
- **Voice Capabilities**: Integrated Text-to-Speech and other voice features.
- **Progressive Web App (PWA) Support**: Installable and offline-capable via Vite and `vite-plugin-pwa`.
- **Image Cropping & Media Previews**: Use of `react-easy-crop` & `react-image-crop` for media manipulation.
- **High-Performance Scrolling**: Virtualized chat lists via `react-virtuoso`.

---

##  Tech Stack

### Frontend
- **Framework**: [React](https://reactjs.org/) (Vite)
- **Styling**: [TailwindCSS](https://tailwindcss.com/)
- **State Management & Logic**: React Hooks
- **Real-time**: Socket.io Client
- **Progressive Web App**: Vite + `vite-plugin-pwa`
- **Image Handling**: `react-easy-crop`, `react-image-crop`
- **Virtualization**: `react-virtuoso`
- **Other**: Modern linting and dev toolchain, hot reloading

### Backend
- **Runtime**: [Node.js](https://nodejs.org/)
- **Framework**: [Express.js](https://expressjs.com/)
- **Database**: [MongoDB](https://www.mongodb.com/) (via Mongoose)
- **Real-time**: Socket.io
- **Security**: Helmet, Rate Limit, CORS, JWT
- **AI**: Google Generative AI, OpenAI SDK
- **Other**: File upload (Multer), push notifications, sanitization, web push, UUID

---

##  Prerequisites

Before you begin, ensure you have the following installed:
- Node.js (v18.0.0 or higher)
- npm (v9.0.0 or higher)
- MongoDB (Local or AtlasURI)

---

## 📦 Installation

### 1. Clone the Repository
```bash
git clone <repository-url>
cd JustUs-V2
```
### 2. Install Dependencies
Install dependencies for the root, backend, and frontend with a single command:
```bash
npm run install-all
```
*Note: This script runs `npm install` in the root, `backend`, and `frontend` directories.*
### 3. Environment Setup
Create a `.env` file in the `backend` directory (see Prerequisites or check `backend/.env.example` if available) with your credentials.

---

## 🏃‍♂️ Running the Application

Start both the backend and frontend servers concurrently:
```bash
npm start
```
- **Backend**: http://localhost:5000
- **Frontend**: http://localhost:5173

You can also run them individually if needed:
- **Backend only**: `npm run server`
- **Frontend development**: `npm run client` (or inside `/frontend`: `npm start`)
- **Frontend production build**: `cd frontend && npm run build`
- **Frontend production preview**: `cd frontend && npm run serve`
- **Frontend linting**: `cd frontend && npm run lint`

---

## Contributing

Contributions are welcome! Please open pull requests for bug fixes or feature additions.

---

## License

This project is licensed under the ISC License.