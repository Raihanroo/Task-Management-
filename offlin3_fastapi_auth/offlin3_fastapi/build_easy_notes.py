from pathlib import Path

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


OUT = Path("Session_08_Easy_Notes_2026-09-22.docx")
NAVY = "17365D"
BLUE = "2F75B5"
LIGHT = "EAF2F8"


def set_font(run, size=12, bold=False, color=None, mono=False):
    run.font.name = "Consolas" if mono else "Nirmala UI"
    run._element.rPr.rFonts.set(qn("w:ascii"), "Consolas" if mono else "Aptos")
    run._element.rPr.rFonts.set(qn("w:hAnsi"), "Consolas" if mono else "Aptos")
    run.font.size = Pt(size)
    run.bold = bold
    if color:
        run.font.color.rgb = RGBColor.from_string(color)


def add_text(doc, text, size=12, before=0, after=7):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(before)
    p.paragraph_format.space_after = Pt(after)
    p.paragraph_format.line_spacing = 1.35
    set_font(p.add_run(text), size=size)
    return p


def add_bullet(doc, title, explanation):
    p = doc.add_paragraph(style="List Bullet")
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.line_spacing = 1.28
    set_font(p.add_run(title + ": "), 12, bold=True, color=NAVY)
    set_font(p.add_run(explanation), 12)


def add_code(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Inches(0.23)
    p.paragraph_format.right_indent = Inches(0.23)
    p.paragraph_format.space_before = Pt(4)
    p.paragraph_format.space_after = Pt(10)
    p.paragraph_format.line_spacing = 1.22
    pr = p._p.get_or_add_pPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), LIGHT)
    pr.append(shd)
    for line in text.splitlines():
        set_font(p.add_run(line + "\n"), 10, mono=True)


def h1(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(18)
    p.paragraph_format.space_after = Pt(8)
    p.paragraph_format.keep_with_next = True
    set_font(p.add_run(text), 18, bold=True, color=NAVY)
    return p


def h2(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(10)
    p.paragraph_format.space_after = Pt(5)
    p.paragraph_format.keep_with_next = True
    set_font(p.add_run(text), 14, bold=True, color=BLUE)
    return p


doc = Document()
section = doc.sections[0]
section.top_margin = Inches(0.72)
section.bottom_margin = Inches(0.72)
section.left_margin = Inches(0.82)
section.right_margin = Inches(0.82)
normal = doc.styles["Normal"]
normal.font.name = "Nirmala UI"
normal._element.rPr.rFonts.set(qn("w:ascii"), "Aptos")
normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Aptos")
normal.font.size = Pt(12)

footer = section.footer.paragraphs[0]
footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
set_font(footer.add_run("Session 08 সহজ নোট | 22 September 2026"), 9, color="5B6573")

# Cover
p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(110)
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
set_font(p.add_run("Session 08"), 20, bold=True, color=BLUE)
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
set_font(p.add_run("FastAPI RBAC Project"), 27, bold=True, color=NAVY)
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
set_font(p.add_run("সহজ ভাষায় আজকের কাজের ব্যাখ্যা"), 16, color="5B6573")
add_text(doc, "", after=24)
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
set_font(p.add_run("তারিখ: 22 September 2026"), 13, bold=True)
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
set_font(p.add_run("এই নোটটি মুখে অন্যকে বুঝিয়ে বলার জন্য তৈরি করা হয়েছে।"), 12)
doc.add_page_break()

h1(doc, "1. এক কথায় আজ কী বানানো হয়েছে?")
add_text(doc, "একটি Task Management API বানানো হয়েছে যেখানে login না করে কেউ protected কাজ করতে পারবে না। কে কী করতে পারবে, সেটি তার role এবং project permission দেখে ঠিক করা হয়।")
add_bullet(doc, "Admin", "সব user দেখতে পারে, user deactivate/activate/delete করতে পারে এবং system limit বদলাতে পারে।")
add_bullet(doc, "Project owner", "যে project create করে সে owner। সে তার project-এর সব task দেখে এবং member-কে edit permission দিতে পারে।")
add_bullet(doc, "Normal user", "সে শুধু নিজের কাছে assigned করা task দেখতে পারে।")
add_bullet(doc, "Editor member", "Owner তাকে can_edit=True দিলে সে task create, update ও delete করতে পারে।")

h1(doc, "2. পুরো system কীভাবে কাজ করে?")
add_code(doc, "1. User register করে\n2. Password hash হয়ে database-এ যায়\n3. User login করে\n4. Server JWT access token দেয়\n5. User token নিয়ে protected route call করে\n6. Server token থেকে user বের করে\n7. Server role / project permission check করে\n8. অনুমতি থাকলে database কাজ করে")
add_text(doc, "মনে রাখবে: JWT token হলো user-এর temporary পরিচয়পত্র। এটি 60 মিনিট valid থাকে।")

h1(doc, "3. কোন package কী কাজ করছে?")
h2(doc, "FastAPI")
add_text(doc, "FastAPI দিয়ে route লেখা হয়। যেমন POST /auth/login বা GET /projects। এটি request body validate করে এবং error response দিতে সাহায্য করে।")
h2(doc, "Uvicorn")
add_text(doc, "Uvicorn server চালায়। Command:")
add_code(doc, "python -m uvicorn main:app --reload")
h2(doc, "SQLAlchemy + asyncpg")
add_text(doc, "SQLAlchemy Python class-কে database table বানায় এবং query লিখতে সাহায্য করে। asyncpg হলো PostgreSQL-এর async driver।")
h2(doc, "pwdlib[argon2]")
add_text(doc, "Password plain text হিসেবে database-এ না রেখে secure hash বানায়। Login-এর সময় সেই hash-এর সঙ্গে password মিলিয়ে দেখে।")
h2(doc, "python-jose")
add_text(doc, "JWT token বানায় ও যাচাই করে। Token expired বা signature ভুল হলে এটি invalid বলে দেয়।")
h2(doc, "python-dotenv")
add_text(doc, ".env file থেকে database password এবং SECRET_KEY পড়তে ব্যবহার করা হয়।")

h1(doc, "4. .env file কেন দরকার?")
add_text(doc, ".env-এ private information থাকে। তাই database password বা JWT secret code-এ লিখে রাখা হয় না।")
add_code(doc, "DB_NAME=offline3db\nDB_USER=postgres\nDB_PASSWORD=your_password\nDB_HOST=localhost\nDB_PORT=5432\nSECRET_KEY=your-long-random-secret")
add_bullet(doc, "SECRET_KEY", "JWT token sign করার key। এটি গোপন রাখতে হবে।")
add_bullet(doc, "Important", ".env কখনো GitHub-এ push করা উচিত নয়।")

h1(doc, "5. core/security.py সহজ ব্যাখ্যা")
h2(doc, "লাইন 3 থেকে 10: import এবং .env load")
add_text(doc, "os দিয়ে environment variable নেওয়া হয়। load_dotenv() চালালে .env-এর SECRET_KEY পাওয়া যায়। jwt এবং PasswordHash হলো JWT ও password security tools।")
h2(doc, "লাইন 12 থেকে 17: token rules")
add_text(doc, "SECRET_KEY না থাকলে app error দেয়। ALGORITHM = HS256 মানে JWT sign করার algorithm। ACCESS_TOKEN_EXPIRE_MINUTES = 60 মানে token 60 মিনিট পরে শেষ হবে।")
h2(doc, "লাইন 20 থেকে 30: password hash ও verify")
add_code(doc, "hash_password('abc12345')\n# password-এর secure hash বানায়\n\nverify_password('abc12345', stored_hash)\n# password মিলে গেলে True দেয়")
h2(doc, "লাইন 35 থেকে 45: JWT create ও decode")
add_text(doc, "create_access_token user id-সহ signed token বানায়। decode_access_token token সঠিক কি না দেখে payload ফেরত দেয়। ভুল/expired হলে None দেয়।")

h1(doc, "6. core/deps.py কেন খুব গুরুত্বপূর্ণ?")
add_text(doc, "এই file বারবার authentication code না লিখে সব route-এ একই security rule ব্যবহার করতে দেয়।")
h2(doc, "get_current_user")
add_code(doc, "current_user: User = Depends(get_current_user)")
add_text(doc, "এই এক লাইন route-এর parameter-এ দিলে FastAPI আগে token নেয়, token decode করে, user id পায়, database থেকে user নেয় এবং user active কি না দেখে। সব ঠিক থাকলে route চলে।")
add_bullet(doc, "401 Unauthorized", "Token নেই, ভুল, expired অথবা user পাওয়া যায়নি।")
add_bullet(doc, "403 Forbidden", "User আছে, কিন্তু তার account deactivate করা বা তার permission নেই।")
h2(doc, "require_role('admin')")
add_text(doc, "এটি শুধু admin route-এ ব্যবহার করা হয়েছে। role admin না হলে route body চালুই হবে না।")

h1(doc, "7. models.py: database-এর চারটি প্রধান table")
h2(doc, "User table")
add_text(doc, "username, email, hashed_password, is_active, role রাখে। role সাধারণত user বা admin।")
h2(doc, "Project table")
add_text(doc, "Project-এর title, description এবং owner_id রাখে। owner_id-এর user-ই ওই project-এর owner।")
h2(doc, "ProjectMember table")
add_text(doc, "কোন user কোন project-এর member এবং can_edit true/false কি না রাখে। একই user একই project-এ দুইবার যেন না ঢোকে, তার জন্য UniqueConstraint আছে।")
h2(doc, "Task table")
add_text(doc, "Task-এর project_id বলে task কোন project-এর। assigned_to_id বলে কার কাছে task দেওয়া হয়েছে। created_by_id বলে কে task তৈরি করেছে।")
h2(doc, "SystemLimit table")
add_text(doc, "Admin এখানে তিনটি limit রাখে: একজন কয়টি project create করবে, একজন কয়টি task create করবে, এবং একটি project-এ সর্বোচ্চ কয়টি task থাকবে।")

h1(doc, "8. schemas.py: input এবং response আলাদা কেন?")
add_text(doc, "Schema বলে দেয় API-তে user কী পাঠাবে এবং server কী ফেরত দেবে। Database model আর schema এক জিনিস নয়।")
add_bullet(doc, "UserRegister", "username, email, password নেয়; password minimum 8 character।")
add_bullet(doc, "UserResponse", "id, username, email, is_active, role ফেরত দেয়; hashed_password দেয় না।")
add_bullet(doc, "ProjectCreate", "title ও description নেয়।")
add_bullet(doc, "TaskCreate", "title, description, assigned_to_id নেয়।")
add_bullet(doc, "TaskUpdate", "যে field বদলাবে শুধু সেটিই পাঠানো যায়।")
add_bullet(doc, "SystemLimitUpdate", "তিনটি limit minimum 1 হতে বাধ্য করে।")

h1(doc, "9. routers/auth.py: register এবং login")
h2(doc, "POST /auth/register")
add_code(doc, "1. username আছে কি না check\n2. email আছে কি না check\n3. password hash\n4. User database-এ save\n5. Safe user response return")
add_text(doc, "Duplicate username বা email থাকলে 400 error দেয়। Password কখনো response-এ ফেরত দেয় না।")
h2(doc, "POST /auth/login")
add_code(doc, "1. username দিয়ে user খোঁজে\n2. verify_password দিয়ে password মেলায়\n3. user active কি না দেখে\n4. create_access_token দিয়ে JWT বানায়\n5. access_token return করে")
add_text(doc, "User deactivate হলে login-এ message পাবে: Your account is temporarily banned।")

h1(doc, "10. routers/admin.py: admin কী কী করতে পারে?")
add_bullet(doc, "GET /admin/users", "সব user list দেখায়।")
add_bullet(doc, "PATCH /admin/users/{id}/deactivate", "User-এর is_active=False করে।")
add_bullet(doc, "PATCH /admin/users/{id}/activate", "User আবার active করে।")
add_bullet(doc, "DELETE /admin/users/{id}", "নিজের account ছাড়া অন্য user delete করতে পারে।")
add_bullet(doc, "GET /admin/limits", "বর্তমান limits দেখায়।")
add_bullet(doc, "PUT /admin/limits", "Project/task count limit বদলায়।")
add_text(doc, "সব endpoint-এ require_role('admin') আছে। তাই normal user এগুলো চালাতে পারবে না।")

h1(doc, "11. routers/projects.py: owner এবং member")
h2(doc, "Project create")
add_text(doc, "Logged-in user POST /projects করলে current_user.id owner_id হিসেবে save হয়। তখন সেই user ওই project-এর owner।")
h2(doc, "Member add")
add_text(doc, "Owner POST /projects/{project_id}/members দিয়ে অন্য user-কে project-এ যোগ করে। can_edit false হলে শুধু member; true হলে editor member।")
h2(doc, "Permission change")
add_text(doc, "Owner PATCH /projects/{project_id}/members/{user_id} দিয়ে can_edit true বা false করতে পারে।")
h2(doc, "Project list")
add_text(doc, "Admin সব project দেখে। অন্য user নিজের project এবং যেসব project-এ member, সেগুলো দেখে।")

h1(doc, "12. routers/tasks.py: কে কোন task দেখবে?")
h2(doc, "Task create")
add_text(doc, "Owner, admin অথবা can_edit=True member task create করতে পারে। Task যাকে দেওয়া হবে, সে active হতে হবে এবং ওই project-এর member/owner হতে হবে।")
h2(doc, "Task list")
add_bullet(doc, "Admin", "সব task দেখে।")
add_bullet(doc, "Project owner", "নিজের project-এর সব task দেখে।")
add_bullet(doc, "Normal user", "শুধু assigned_to_id নিজের id হলে task দেখে।")
h2(doc, "Task update/delete")
add_text(doc, "শুধু admin, project owner অথবা can_edit=True member পারে। সাধারণ assigned user edit করতে পারে না, যদি না owner তাকে edit permission দেয়।")
h2(doc, "Limit check")
add_text(doc, "নতুন task save করার আগে system দেখে: creator কি নিজের task limit পার করেছে? project কি তার task limit পার করেছে? কোনোটি পার হলে 400 error দেয়।")

h1(doc, "13. main.py কী করে?")
add_text(doc, "main.py সব router এক জায়গায় জোড়া দেয়। Server চালু হলে lifespan function init_db() চালায়। এতে database table ও দরকারি নতুন column তৈরি/ensure হয়।")
add_code(doc, "app.include_router(auth_router)\napp.include_router(admin_router)\napp.include_router(projects_router)\napp.include_router(tasks_router)")

h1(doc, "14. Swagger-এ কীভাবে test করবে?")
add_code(doc, "python -m uvicorn main:app --reload\nতারপর browser: http://127.0.0.1:8000/docs")
add_bullet(doc, "Step 1", "দুই/তিনটি user register করো।")
add_bullet(doc, "Step 2", "PostgreSQL-এ একজনকে admin করো: UPDATE users SET role='admin' WHERE username='your_username';")
add_bullet(doc, "Step 3", "Login করে access_token নাও।")
add_bullet(doc, "Step 4", "Swagger-এর Authorize-এ Bearer token দাও।")
add_bullet(doc, "Step 5", "Admin দিয়ে limits দেখো; normal user দিয়ে project create করো; owner দিয়ে member যোগ করো; তারপর task assign করো।")

h1(doc, "15. অন্যকে 30 সেকেন্ডে কীভাবে বোঝাবে?")
add_text(doc, "আমাদের API-তে password secure hash হিসেবে থাকে। Login করলে JWT token পাওয়া যায়। প্রতিটি protected route token থেকে user বের করে এবং user active কি না দেখে। Admin user management ও limits নিয়ন্ত্রণ করে। Project creator owner হয় এবং member-কে edit permission দিতে পারে। Task assignment থাকার কারণে normal user শুধু নিজের task দেখে, কিন্তু owner সব task দেখে।")

h1(doc, "16. মনে রাখার মতো 5টি কথা")
add_bullet(doc, "Password", "Plain password database-এ রাখা যাবে না।")
add_bullet(doc, "JWT", "Token ছাড়া protected API call করা যাবে না।")
add_bullet(doc, "Role", "Admin-এর global ক্ষমতা।")
add_bullet(doc, "Ownership", "Project owner per-project ক্ষমতা।")
add_bullet(doc, "Permission", "can_edit member-এর edit করার ক্ষমতা।")

doc.save(OUT)
print(OUT.resolve())
