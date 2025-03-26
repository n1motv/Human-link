# HUMAN LINK ( An advanced Human Resource Management System )

A comprehensive Human Resource Management System for employee management, leave tracking, notifications, and more. Designed for small to medium businesses with scalability in mind.

## Key Features

- 📅 Employee leave management and approval system
- 🔔 Real-time notifications system
- 📊 Dashboard analytics for HR metrics
- 📝 Employee information management
- 📧 Password reset functionality
- 🏠 Telework management system
- 📑 Document storage vault
- 📆 Interactive calendar integration
- ✅ Meeting scheduling system
- And many other functionalities...

## New in This Version (2.0)

**1.Multi-Language Chatbot with Automatic Translation**

- Integrated a chatbot that supports multiple languages (English, French, Arabic, Tamazight, Italian, Spanish).

- If a Large Language Model (LLM) is unavailable, the system falls back to a built-in question-answer prediction engine (see exemple_questions.txt for sample queries).

**2.Work Environment Feedback & Analysis**

- Added a monthly feedback system where employees rate various work environment factors (management, recognition, communication, etc.).

- Administrators can view aggregated results on a dedicated feedback dashboard, including average ratings and anonymous suggestions.

**3.Modern Design & Enhanced UI/UX**
- Changing the logo

- Refreshed color scheme and streamlined layout for more fluid navigation.

- Responsive design for desktop, tablet, and mobile.

**4.Security & AWS S3 Integration**

- Database encryption & usage of Argon2 hashing (replacing bcrypt) for stronger password security.

- All images, documents, and justifications stored securely on Amazon AWS S3 with presigned URLs.

**5.Improved Code Decomposition**

- Separated large files into smaller modules for maintainability (helpers.py, db_setup.py, s3_utils.py, etc.).

- Clearer structure and naming conventions.

**6.Bug Fixes & Task Automation**

- Addressed known issues from the previous release.

- Added automated tasks (e.g., monthly feedback reminders, weekly telework notifications) using APScheduler.

**7.Internationalization (i18n) & Translation**

- Added partial or full translations for English, Arabic, Tamazight, Italian, and Spanish.

- The application automatically detects the user’s preferred language in certain modules (or allows a manual switch).

## Installation

### Prerequisites
- Python 3.9+
- SQLite3
- SMTP email credentials (for email functionality)
- AWS S3 bucket & credentials

### Setup Steps

1. **Clone Repository**
   ```bash
   git clone https://github.com/n1motv/human-link.git
   cd human-link
   ```
2. **Create Virtual Environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  #On Windows: venv\Scripts\activate
   ```
3. **Install Dependencies**
   ```bash
   pip install -r requirements.txt
   ```
4. **Install Dependencies**
   
   Create .env file:
   ```ini
   SECRET_KEY=your-secret-key
   MAIL_USERNAME=your-email@gmail.com
   MAIL_PASSWORD=your-email-password   # For mail authentification with the server
   AWS_ACCESS_KEY_ID=your-aws-access-key
   AWS_SECRET_ACCESS_KEY=your-aws-secret-key
   S3_BUCKET_NAME=your-s3-bucket
   LLM_API_URL=optional-llm-endpoint
   MODEL_NAME=optional-llm-model

   ```

5. **Run Application**

   ```bash
   python app.py
   ```

## 📖 Usage

### 🛠️ Roles Overview

| Role      | Access Level                                     |
|-----------|-------------------------------------------------|
| **Admin**  | Full system access                             |
| **Manager** | Team management, leave approvals             |
| **Employee** | Personal dashboard, leave requests         |

### 🔄 Key Workflows

#### **Admin**:
- Manage all employee records
- Configure system settings
- Handle license management
- Access advanced analytics
- View advanced analytics and feedback results

#### **Manager**:
- Approve/reject leave requests
- Submit bonus requests
- Manage team schedules
- Track team attendance

#### **Employee**:
- Submit leave requests
- Update personal information
- View payslips
- Manage telework days
- Chatbot Q&A for quick HR questions

---

## 📜 License

This software is provided under a **custom license**:

### ✅ **Free Use**:
✔️ Personal use  
✔️ Small businesses (**<10 employees**)  
✔️ Non-profit organizations  

### 🛑 **Paid License Required**:
❌ Enterprises (**>10 employees**)  
❌ Government agencies  
❌ Commercial resellers  

---

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. **Fork** the repository  
2. Create your feature branch:  
   ```bash
   git checkout -b feature/AmazingFeature
   ```
3. Commit your changes:  
   ```bash
   git commit -m "Add some AmazingFeature"
   ```
4. Push to the branch:  
   ```bash
   git push origin feature/AmazingFeature
   ```
5. Open a Pull Request 🚀

## 📢 Contact & Support

For **technical support** or **licensing inquiries**:

📧 **Email**: ezzaouimohamedamine@gmail.com  
🔗 **LinkedIn** : [linkedin.com/in/mohamed-amine-ez-zaoui](https://www.linkedin.com/in/mohamed-amine-ez-zaoui/)  
💼 **GitHub** : [github.com/n1motv](https://github.com/n1motv)

---

## ⚠️ Important Notice

This software is provided **"as-is"** without warranty.  
🚨 **Always back up your data before deployment.**

   
   
