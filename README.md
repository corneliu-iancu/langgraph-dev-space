# Python Project

A Python project template with modern development tools and best practices.

## Features

- Modern Python project structure
- Development tools (pytest, black, flake8, mypy)
- Environment variable management
- Comprehensive documentation

## Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd <project-name>
   ```

2. **Create a virtual environment**
   ```bash
   python -m venv venv
   
   # On Windows
   venv\Scripts\activate
   
   # On macOS/Linux
   source venv/bin/activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

## Development

### Running the application
```bash
python src/main.py
```

### Running tests
```bash
pytest
```

### Code formatting
```bash
black .
```

### Linting
```bash
flake8 .
```

### Type checking
```bash
mypy .
```

## Project Structure

```
├── src/                    # Source code
│   ├── __init__.py
│   └── main.py
├── tests/                  # Test files
│   ├── __init__.py
│   └── test_main.py
├── docs/                   # Documentation
├── .env.example           # Environment variables template
├── .gitignore             # Git ignore file
├── requirements.txt       # Python dependencies
└── README.md             # This file
```

## License

This project is licensed under the MIT License. 