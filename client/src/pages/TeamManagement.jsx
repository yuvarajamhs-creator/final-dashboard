import React, { useState } from "react";
import "./TeamManagement.css";

export default function TeamManagement() {
  // Sample data matching the image
  const initialTeamMembers = [
    {
      id: 1,
      name: "Sri devi Accounts",
      country: "INDIA",
      phone: "+91-7845859665",
      email: "sridevi.m16mhs@gmail.com",
      type: "Restricted",
      createdOn: "19 Jan, 2026",
      profilePicture: null
    },
    {
      id: 2,
      name: "Kaviyasri",
      country: "INDIA",
      phone: "+91-9876543210",
      email: "kaviyasri@example.com",
      type: "Restricted",
      createdOn: "06 Jan, 2026",
      profilePicture: null
    },
    {
      id: 3,
      name: "Dhana",
      country: "INDIA",
      phone: "+91-8765432109",
      email: "dhana@example.com",
      type: "Restricted",
      createdOn: "22 Dec, 2025",
      profilePicture: null
    },
    {
      id: 4,
      name: "Vasanth",
      country: "INDIA",
      phone: "+91-7654321098",
      email: "vasanth@example.com",
      type: "Admin",
      createdOn: "19 Dec, 2025",
      profilePicture: null
    },
    {
      id: 5,
      name: "Thamil",
      country: "INDIA",
      phone: "+91-6543210987",
      email: "thamil@example.com",
      type: "Restricted",
      createdOn: "15 Dec, 2025",
      profilePicture: null
    },
    {
      id: 6,
      name: "Sri devi priya",
      country: "INDIA",
      phone: "+91-5432109876",
      email: "sridevipriya@example.com",
      type: "Restricted",
      createdOn: "24 Nov, 2025",
      profilePicture: null
    }
  ];

  const [teamMembers, setTeamMembers] = useState(initialTeamMembers);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState(null);
  const [editingMember, setEditingMember] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    country: "INDIA",
    phone: "",
    email: "",
    type: "Restricted"
  });
  const [selectedService, setSelectedService] = useState("All memberships");

  // Filter team members based on search query
  const filteredMembers = teamMembers.filter(member =>
    member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    member.phone.includes(searchQuery)
  );

  // Copy to clipboard function
  const copyToClipboard = (text, type) => {
    navigator.clipboard.writeText(text).then(() => {
      // You could add a toast notification here
      console.log(`${type} copied to clipboard`);
    });
  };

  // Handle add new member
  const handleAddMember = () => {
    setEditingMember(null);
    setFormData({
      name: "",
      country: "INDIA",
      phone: "",
      email: "",
      type: "Restricted"
    });
    setShowAddModal(true);
  };

  // Handle edit member
  const handleEditMember = (member) => {
    setEditingMember(member);
    setFormData({
      name: member.name,
      country: member.country,
      phone: member.phone,
      email: member.email,
      type: member.type
    });
    setShowAddModal(true);
  };

  // Handle delete member
  const handleDeleteMember = (id) => {
    if (window.confirm("Are you sure you want to delete this team member?")) {
      setTeamMembers(teamMembers.filter(member => member.id !== id));
    }
  };

  // Handle manage permissions
  const handleManagePermissions = (member) => {
    setSelectedMember(member);
    setShowPermissionsModal(true);
  };

  // Handle save member (add or edit)
  const handleSaveMember = () => {
    if (!formData.name || !formData.email || !formData.phone) {
      alert("Please fill in all required fields");
      return;
    }

    if (editingMember) {
      // Update existing member
      setTeamMembers(teamMembers.map(member =>
        member.id === editingMember.id
          ? {
              ...member,
              ...formData,
              createdOn: member.createdOn // Keep original date
            }
          : member
      ));
    } else {
      // Add new member
      const newMember = {
        id: Date.now(),
        ...formData,
        createdOn: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      };
      setTeamMembers([...teamMembers, newMember]);
    }

    setShowAddModal(false);
    setEditingMember(null);
    setFormData({
      name: "",
      country: "INDIA",
      phone: "",
      email: "",
      type: "Restricted"
    });
  };

  // Handle save permissions
  const handleSavePermissions = () => {
    // Handle permissions save logic here
    console.log("Saving permissions for", selectedMember, "with service", selectedService);
    setShowPermissionsModal(false);
    setSelectedMember(null);
  };

  return (
    <div className="team-management-container">
      {/* Header */}
      <div className="team-header">
        <h1 className="team-title">Team Members</h1>
        <button className="btn-add-member" onClick={handleAddMember}>
          <span className="plus-icon">+</span> Add new member
        </button>
      </div>

      {/* Search Bar */}
      <div className="search-container">
        <div className="search-input-wrapper">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Search by name, phone"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Team Members Table */}
      <div className="table-container">
        <table className="team-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact</th>
              <th>Type</th>
              <th>Created On</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredMembers.map((member) => (
              <tr key={member.id}>
                <td>
                  <div className="member-name-cell">
                    <div className="member-name">{member.name}</div>
                    <div className="member-country">
                      <span className="flag-icon">🇮🇳</span> {member.country}
                    </div>
                  </div>
                </td>
                <td>
                  <div className="contact-cell">
                    <div className="contact-item">
                      <span className="contact-value">{member.phone}</span>
                      <button
                        className="copy-btn"
                        onClick={() => copyToClipboard(member.phone, "Phone")}
                        title="Copy phone number"
                      >
                        📋
                      </button>
                    </div>
                    <div className="contact-item">
                      <span className="contact-value">{member.email}</span>
                      <button
                        className="copy-btn"
                        onClick={() => copyToClipboard(member.email, "Email")}
                        title="Copy email"
                      >
                        📋
                      </button>
                    </div>
                  </div>
                </td>
                <td>
                  <span className={`type-badge ${member.type.toLowerCase()}`}>
                    {member.type}
                  </span>
                </td>
                <td>{member.createdOn}</td>
                <td>
                  <div className="action-buttons">
                    <button
                      className="btn-manage-permissions"
                      onClick={() => handleManagePermissions(member)}
                    >
                      Manage permissions
                    </button>
                    <button
                      className="btn-action btn-edit"
                      onClick={() => handleEditMember(member)}
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      className="btn-action btn-delete"
                      onClick={() => handleDeleteMember(member.id)}
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Member Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">
                {editingMember ? "Edit team member" : "Add new team member"}
              </h2>
              <button
                className="modal-close"
                onClick={() => setShowAddModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              {/* Profile Picture Upload */}
              <div className="profile-upload-container">
                <div className="profile-upload-circle">
                  <span className="upload-icon">+</span>
                  <span className="upload-text">Upload</span>
                </div>
              </div>

              {/* Name Field */}
              <div className="form-group">
                <label className="form-label">
                  Name
                  <span className="char-counter">
                    {formData.name.length}/30
                  </span>
                </label>
                <input
                  type="text"
                  className="form-input"
                  maxLength={30}
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
              </div>

              {/* Country and Phone */}
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Select a country</label>
                  <select
                    className="form-input form-select"
                    value={formData.country}
                    onChange={(e) =>
                      setFormData({ ...formData, country: e.target.value })
                    }
                  >
                    <option value="INDIA">India</option>
                    <option value="USA">United States</option>
                    <option value="UK">United Kingdom</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Phone number</label>
                  <input
                    type="tel"
                    className="form-input"
                    value={formData.phone}
                    onChange={(e) =>
                      setFormData({ ...formData, phone: e.target.value })
                    }
                  />
                </div>
              </div>

              {/* Email Field */}
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  className="form-input"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                />
              </div>

              {/* User Access Type */}
              <div className="form-group">
                <label className="form-label">User access type:</label>
                <div className="access-type-options">
                  <label className="access-type-option">
                    <input
                      type="radio"
                      name="accessType"
                      value="Admin"
                      checked={formData.type === "Admin"}
                      onChange={(e) =>
                        setFormData({ ...formData, type: "Admin" })
                      }
                    />
                    <div className="option-content">
                      <div className="option-title">Admin Access</div>
                      <div className="option-description">
                        Access to all the modules
                      </div>
                    </div>
                  </label>
                  <label className="access-type-option">
                    <input
                      type="radio"
                      name="accessType"
                      value="Restricted"
                      checked={formData.type === "Restricted"}
                      onChange={(e) =>
                        setFormData({ ...formData, type: "Restricted" })
                      }
                    />
                    <div className="option-content">
                      <div className="option-title">Restricted Access</div>
                      <div className="option-description">
                        Access to particular modules
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-save" onClick={handleSaveMember}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Permissions Modal */}
      {showPermissionsModal && (
        <div
          className="modal-overlay"
          onClick={() => setShowPermissionsModal(false)}
        >
          <div
            className="modal-content permissions-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 className="modal-title">Manage Permissions</h2>
              <button
                className="modal-close"
                onClick={() => setShowPermissionsModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">
                  Select Services in which you want to give access permissions
                </label>
                <div className="service-select-wrapper">
                  <select
                    className="form-input service-select"
                    value={selectedService}
                    onChange={(e) => setSelectedService(e.target.value)}
                  >
                    <option value="Admin Access">All memberships</option>
                    <option value="Manger Access">Basic Plan</option>
                    <option value="Team leader Access">Premium Plan</option>
                  </select>
                </div>
                <p className="service-hint">
                  If you choose all memberships, access permission will be
                  given to your future memberships automatically.
                </p>
              </div>

              <div className="warning-alert">
                <span className="warning-icon">⚠️</span>
                <div className="warning-text">
                  Any user account created previously using these credentials
                  will be given elevated permissions on dashboard and any
                  existing subscriptions would be cancelled. Do you wish to
                  continue?
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-save" onClick={handleSavePermissions}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
