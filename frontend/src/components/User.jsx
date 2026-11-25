// src/components/User.jsx
// Muestra el perfil del usuario logueado con los datos de la sesión (useAuth / lf_user).
// Lo que no tiene fuente real (teléfono, actividad, reservas, configuraciones) no se muestra.
import { Modal, Tabs, Tab, Row, Col, Card, Badge } from "react-bootstrap"

const customStyles = `
  .brand-pale-green {
    background-color: #e6efe9 !important;
  }
  .text-brand-dark-green {
    color: #0b3d23 !important;
  }
  .user-card {
    border-radius: 12px !important;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
`

const ROLE_LABELS = {
  ADMINISTRADOR: "Administrador",
  GESTOR: "Gestor",
  TECNICO: "Técnico",
  INMOBILIARIA: "Inmobiliaria",
}

function formatFecha(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("es-AR")
}

export default function User({ show, onHide, user }) {
  if (!user) return null // No renderiza basicamente si no hay usuario

  const role = String(user.role ?? "").toUpperCase()
  const roleLabel = ROLE_LABELS[role] ?? user.role
  const miembroDesde = formatFecha(user.createdAt)

  return (
    <>
      <style>{customStyles}</style>
      <Modal show={show} onHide={onHide} size="lg" centered>
        <Modal.Header closeButton className="brand-pale-green">
          <Modal.Title className="text-brand-dark-green fw-bold">Mi Cuenta</Modal.Title>
        </Modal.Header>

        <Modal.Body className="p-4">
          <Tabs defaultActiveKey="profile" className="mb-4">
            <Tab
              eventKey="profile"
              title={
                <span>
                  <i className="bi bi-person me-2"></i>Mi Perfil
                </span>
              }
            >
              <Row className="g-4">
                <Col md={4} className="text-center">
                  <Card className="user-card">
                    <Card.Body className="p-4">
                      <i
                        className="bi bi-person-circle text-brand-dark-green d-block mb-3"
                        style={{ fontSize: "5rem", lineHeight: 1 }}
                        aria-hidden="true"
                      ></i>
                      <h5 className="text-brand-dark-green fw-bold mb-2">{user.username}</h5>
                      <Badge bg="secondary" className="px-3 py-2">
                        {roleLabel}
                      </Badge>
                      {role === "INMOBILIARIA" && user.inmobiliariaNombre && (
                        <div className="text-muted mt-2">{user.inmobiliariaNombre}</div>
                      )}
                    </Card.Body>
                  </Card>
                </Col>

                <Col md={8}>
                  <Card className="user-card">
                    <Card.Header className="brand-pale-green">
                      <h6 className="text-brand-dark-green mb-0 fw-bold">Información de Contacto</h6>
                    </Card.Header>
                    <Card.Body className="p-4">
                      <div className="mb-3 d-flex align-items-center">
                        <i className="bi bi-envelope me-3 text-brand-dark-green" style={{ fontSize: "1.1rem" }}></i>
                        <span>{user.email}</span>
                      </div>
                      {miembroDesde && (
                        <div className="d-flex align-items-center">
                          <i className="bi bi-calendar me-3 text-brand-dark-green" style={{ fontSize: "1.1rem" }}></i>
                          <span>Miembro desde {miembroDesde}</span>
                        </div>
                      )}
                    </Card.Body>
                  </Card>
                </Col>
              </Row>
            </Tab>
          </Tabs>
        </Modal.Body>
      </Modal>
    </>
  )
}
