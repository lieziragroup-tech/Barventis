import re

with open("src/components/layout/DashboardLayout.jsx", "r", encoding="utf-8") as f:
    code = f.read()

# Desktop sidebar
code = code.replace(
    '<NavItem to={`${basePath}/pos`} label="Upload POS Sales" icon={UploadCloud}  isHovered={isHovered} index={8} />',
    '<NavItem to={`${basePath}/pos`} label="Upload POS Sales (Moka/GoBiz)" icon={UploadCloud}  isHovered={isHovered} index={8} />\n                      <NavItem to={`${basePath}/esb-upload`} label="Upload POS (ESB)" icon={UploadCloud}  isHovered={isHovered} index={8.5} />'
)

# Mobile sidebar
code = code.replace(
    '<NavItem onClick={() => setIsSidebarOpen(false)} to={`${basePath}/pos`} label="Upload POS Sales" icon={UploadCloud}  isHovered={true} index={13} />',
    '<NavItem onClick={() => setIsSidebarOpen(false)} to={`${basePath}/pos`} label="Upload POS Sales (Moka/GoBiz)" icon={UploadCloud}  isHovered={true} index={13} />\n                  <NavItem onClick={() => setIsSidebarOpen(false)} to={`${basePath}/esb-upload`} label="Upload POS (ESB)" icon={UploadCloud}  isHovered={true} index={13.5} />'
)

# Titles
code = code.replace(
    '{location.pathname === `${basePath}/pos` && "POS Kasir Integration"}',
    '{location.pathname === `${basePath}/pos` && "POS Kasir Integration"}\n                    {location.pathname === `${basePath}/esb-upload` && "ESB POS Sync & Deduct"}'
)

code = code.replace(
    '{location.pathname === `${basePath}/pos` && "Browser-side Excel parser. Drag and drop POS reports to deduct raw stock."}',
    '{location.pathname === `${basePath}/pos` && "Browser-side Excel parser. Drag and drop POS reports to deduct raw stock."}\n                  {location.pathname === `${basePath}/esb-upload` && "Smart parser for ESB format with auto-deduct, missing-recipe detection, and auto-rollback."}'
)

with open("src/components/layout/DashboardLayout.jsx", "w", encoding="utf-8") as f:
    f.write(code)

print("Updated DashboardLayout.jsx")
