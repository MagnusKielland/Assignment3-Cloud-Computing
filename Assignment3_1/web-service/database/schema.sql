CREATE TABLE users (
    id SERIAL PRIMARY KEY,        
    cognito_user_id VARCHAR(255) UNIQUE NOT NULL, 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP 
);

CREATE TABLE files (
    id SERIAL PRIMARY KEY,          
    user_id INT REFERENCES users(id), 
    file_name VARCHAR(255) NOT NULL, 
    file_type VARCHAR(50) NOT NULL,  
    s3_key VARCHAR(255) NOT NULL,    
    upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
    file_size VARCHAR(20)                
);
