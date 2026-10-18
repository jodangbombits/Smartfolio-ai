import {
    LayoutDashboard,
    FileText,
    MessageSquare,
    Sparkles,
    User,
    LogOut,
    Clock,
    CheckCircle,
    XCircle,
    Users,
} from "lucide-react";
import "./Sidebar.css";

// Links para sa STUDENT
export const studentLinks = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "logs", label: "My DTR Logs", icon: FileText },
    { id: "messages", label: "Messages", icon: MessageSquare },
    { id: "ai", label: "AI Assistant", icon: Sparkles },
    { id: "profile", label: "Profile", icon: User },
];

// Links para sa SUPERVISOR
export const supervisorLinks = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "pending", label: "Pending Approvals", icon: Clock },
    { id: "approved", label: "Approved Logs", icon: CheckCircle },
    { id: "rejected", label: "Rejected / Revision", icon: XCircle },
    { id: "students", label: "Students", icon: Users },
    { id: "messages", label: "Messages", icon: MessageSquare },
    { id: "ai", label: "AI Insights", icon: Sparkles },
];

export default function Sidebar({
    role = "student", // "student" o "supervisor"
    userName = "User",
    active = "dashboard",
    onChange = () => { },
    onLogout = () => { },
}) {
    const links = role === "supervisor" ? supervisorLinks : studentLinks;

    return (
        <aside className="sidebar">
            {/* Logo */}
            <div className="sidebar-logo">
                <span className="sidebar-logo-icon">⚡</span>
                <span>SmartFolio</span>
            </div>

            {/* User info */}
            <div className="sidebar-user">
                <div className={`sidebar-avatar ${role}`}>
                    {userName.charAt(0).toUpperCase()}
                </div>
                <div className="sidebar-user-info">
                    <div className="sidebar-user-name">{userName}</div>
                    <div className="sidebar-user-role">
                        {role === "supervisor" ? "Supervisor" : "Student Intern"}
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <nav className="sidebar-nav">
                {links.map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        className={`sidebar-link ${active === id ? "active" : ""}`}
                        onClick={() => onChange(id)}
                    >
                        <Icon size={18} />
                        <span>{label}</span>
                    </button>
                ))}
            </nav>

            {/* Logout */}
            <button className="sidebar-logout" onClick={onLogout}>
                <LogOut size={18} />
                <span>Logout</span>
            </button>
        </aside>
    );
}