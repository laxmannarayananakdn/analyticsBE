#!/bin/bash

# Nexquare API Testing Script
# Run this from the backend folder: ./test-nexquare.sh

BASE_URL="http://localhost:3001/api/nexquare"

echo "🧪 Testing Nexquare API Integration"
echo "===================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Authentication
echo "1️⃣  Testing Authentication..."
echo "   POST ${BASE_URL}/authenticate"
response=$(curl -s -X POST "${BASE_URL}/authenticate" -w "\n%{http_code}")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" -eq 200 ]; then
    echo -e "${GREEN}✅ Authentication successful${NC}"
    echo "$body" | jq '.' 2>/dev/null || echo "$body"
else
    echo -e "${RED}❌ Authentication failed (HTTP $http_code)${NC}"
    echo "$body"
fi
echo ""

# Wait a moment
sleep 1

# Test 2: Get Schools
echo "2️⃣  Testing Get Schools..."
echo "   GET ${BASE_URL}/schools"
response=$(curl -s -X GET "${BASE_URL}/schools?filter=status='active'" -w "\n%{http_code}")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" -eq 200 ]; then
    echo -e "${GREEN}✅ Schools fetched successfully${NC}"
    echo "$body" | jq '.' 2>/dev/null || echo "$body"
else
    echo -e "${RED}❌ Failed to fetch schools (HTTP $http_code)${NC}"
    echo "$body"
fi
echo ""

# Wait a moment
sleep 1

# Test 3: Verify School Access
echo "3️⃣  Testing Verify School Access..."
echo "   GET ${BASE_URL}/verify-school"
response=$(curl -s -X GET "${BASE_URL}/verify-school" -w "\n%{http_code}")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" -eq 200 ]; then
    echo -e "${GREEN}✅ School verification successful${NC}"
    echo "$body" | jq '.' 2>/dev/null || echo "$body"
else
    echo -e "${RED}❌ School verification failed (HTTP $http_code)${NC}"
    echo "$body"
fi
echo ""

# Wait a moment
sleep 1

# Test 4: Get Status
echo "4️⃣  Testing Get Status..."
echo "   GET ${BASE_URL}/status"
response=$(curl -s -X GET "${BASE_URL}/status" -w "\n%{http_code}")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" -eq 200 ]; then
    echo -e "${GREEN}✅ Status check successful${NC}"
    echo "$body" | jq '.' 2>/dev/null || echo "$body"
else
    echo -e "${RED}❌ Status check failed (HTTP $http_code)${NC}"
    echo "$body"
fi
echo ""

echo "===================================="
echo -e "${GREEN}✅ Testing complete!${NC}"
echo ""
echo "💡 Tip: If you see errors, make sure:"
echo "   1. Backend server is running (npm run dev)"
echo "   2. Environment variables are set in .env file"
echo "   3. Database connection is working"
echo "   4. Nexquare credentials are correct"
