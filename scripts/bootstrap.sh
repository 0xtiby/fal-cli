#!/bin/bash

# Registers the package on npm with a placeholder version using local auth.
# After this, configure trusted publishing in the npm UI.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check npm auth
if ! npm whoami &> /dev/null; then
    echo -e "${RED}❌ Not logged in to npm. Please run: npm login${NC}"
    exit 1
fi

# Get package name from package.json
PACKAGE_NAME=$(node -p "require('./package.json').name")
echo -e "${YELLOW}📦 Bootstrapping ${PACKAGE_NAME}...${NC}"

# Check if package already exists on npm
if npm view "$PACKAGE_NAME" version &> /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Package ${PACKAGE_NAME} already exists on npm. Skipping bootstrap.${NC}"
    exit 0
fi

# Save original package.json
cp package.json package.json.bak

# Create minimal package.json for placeholder publish
node -e "
const pkg = require('./package.json');
const minimal = {
  name: pkg.name,
  version: '0.0.0-placeholder',
  description: pkg.description || 'Placeholder',
  publishConfig: { access: 'public' }
};
require('fs').writeFileSync('package.json', JSON.stringify(minimal, null, 2));
"

# Publish placeholder
echo -e "${YELLOW}📤 Publishing placeholder version...${NC}"
npm publish --access public

# Restore original package.json
mv package.json.bak package.json

echo -e "${GREEN}✅ Package ${PACKAGE_NAME} registered on npm!${NC}"
echo ""
echo -e "${YELLOW}📋 Next steps:${NC}"
echo -e "   1. Go to https://www.npmjs.com/package/${PACKAGE_NAME}/access"
echo -e "   2. Configure trusted publisher (GitHub Actions):"
echo -e "      • Repository: <owner>/${PACKAGE_NAME}"
echo -e "      • Workflow: release.yml"
echo -e "      • Environment: (leave empty)"
echo -e "   3. Run ${GREEN}pnpm setup:branch-protection${NC}"
echo -e "   4. Push a feat: commit to trigger your first release"
