require('dotenv').config();

const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const db = require('./db');
const { auth, roles } = require('./auth');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'dev_only_change_me';

// ======================================================
// COMMON HELPERS
// ======================================================

const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

const validEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const passwordIsValid = (password) => {
    return (
        typeof password === 'string' &&
        password.length >= 8 &&
        /[a-z]/.test(password) &&
        /[A-Z]/.test(password) &&
        /[0-9]/.test(password) &&
        /[^A-Za-z0-9]/.test(password)
    );
};

const validVehicleType = (type) => {
    return ['Car', 'Motorcycle', 'Bicycle', 'Other'].includes(type);
};

const cleanPlate = (plate) => {
    return String(plate || '').trim().toUpperCase();
};

const getOwnerId = async (connection, userId) => {
    const [rows] = await connection.query(
        'SELECT id FROM vehicle_owners WHERE user_id = ?',
        [userId]
    );

    return rows.length ? rows[0].id : null;
};

const rollbackQuietly = async (connection) => {
    try {
        await connection.rollback();
    } catch (error) {
        console.error('Transaction rollback error:', error.message);
    }
};

// ======================================================
// HEALTH CHECK
// ======================================================

app.get('/api/health', asyncHandler(async (req, res) => {
    await db.query('SELECT 1');

    res.json({
        ok: true,
        database: 'connected'
    });
}));

// ======================================================
// FIRST ADMIN SETUP
// ======================================================

app.post('/api/setup', asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({
            error: 'Name, email and password are required.'
        });
    }

    const cleanName = String(name).trim();
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPassword = String(password);

    if (!cleanName || !validEmail(cleanEmail)) {
        return res.status(400).json({
            error: 'Enter a valid name and email.'
        });
    }

    if (!passwordIsValid(cleanPassword)) {
        return res.status(400).json({
            error: 'Password must contain at least 8 characters, lowercase, uppercase, number and special character.'
        });
    }

    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const [existingUsers] = await connection.query(
            'SELECT COUNT(*) AS total FROM users'
        );

        if (Number(existingUsers[0].total) > 0) {
            await connection.rollback();

            return res.status(409).json({
                error: 'Setup is already complete. Sign in instead.'
            });
        }

        const passwordHash = await bcrypt.hash(cleanPassword, 12);

        const [result] = await connection.query(
            `INSERT INTO users
                (full_name, email, password_hash, role)
             VALUES (?, ?, ?, 'admin')`,
            [cleanName, cleanEmail, passwordHash]
        );

        await connection.query(
            'INSERT INTO vehicle_owners (user_id) VALUES (?)',
            [result.insertId]
        );

        await connection.commit();

        res.status(201).json({
            message: 'Admin created. You can now sign in.'
        });

    } catch (error) {
        await rollbackQuietly(connection);

        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                error: 'That email is already registered.'
            });
        }

        throw error;

    } finally {
        connection.release();
    }
}));

// ======================================================
// OWNER REGISTRATION
// ======================================================

app.post('/api/auth/register', asyncHandler(async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({
            error: 'Name, email and password are required.'
        });
    }

    const cleanName = String(name).trim();
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPassword = String(password);

    if (!cleanName || !validEmail(cleanEmail)) {
        return res.status(400).json({
            error: 'Enter a valid name and email.'
        });
    }

    if (!passwordIsValid(cleanPassword)) {
        return res.status(400).json({
            error: 'Password must contain at least 8 characters, lowercase, uppercase, number and special character.'
        });
    }

    const passwordHash = await bcrypt.hash(cleanPassword, 12);
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const [result] = await connection.query(
            `INSERT INTO users
                (full_name, email, password_hash, role)
             VALUES (?, ?, ?, 'owner')`,
            [cleanName, cleanEmail, passwordHash]
        );

        await connection.query(
            'INSERT INTO vehicle_owners (user_id) VALUES (?)',
            [result.insertId]
        );

        await connection.commit();

        res.status(201).json({
            message: 'Account created successfully. Please sign in.'
        });

    } catch (error) {
        await rollbackQuietly(connection);

        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                error: 'This email is already registered.'
            });
        }

        throw error;

    } finally {
        connection.release();
    }
}));

// ======================================================
// GUARD REGISTRATION
// ======================================================

app.post('/api/auth/register-guard', asyncHandler(async (req, res) => {
    const { name, email, phone, assigned_gate, password } = req.body;

    if (!name || !email || !phone || !assigned_gate || !password) {
        return res.status(400).json({
            error: 'All guard registration fields are required.'
        });
    }

    const cleanName = String(name).trim();
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPhone = String(phone).trim();
    const cleanGate = String(assigned_gate).trim();
    const cleanPassword = String(password);

    if (!cleanName || !validEmail(cleanEmail)) {
        return res.status(400).json({
            error: 'Enter a valid name and email.'
        });
    }

    if (!passwordIsValid(cleanPassword)) {
        return res.status(400).json({
            error: 'Password must contain at least 8 characters, lowercase, uppercase, number and special character.'
        });
    }

    const passwordHash = await bcrypt.hash(cleanPassword, 12);

    try {
        const [result] = await db.query(
            `INSERT INTO users
                (full_name, email, password_hash, role,
                 account_status, phone, assigned_gate)
             VALUES (?, ?, ?, 'guard', 'pending', ?, ?)`,
            [
                cleanName,
                cleanEmail,
                passwordHash,
                cleanPhone,
                cleanGate
            ]
        );

        res.status(201).json({
            message: 'Guard application submitted. Wait for admin approval.',
            application_id: result.insertId
        });

    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                error: 'This email is already registered.'
            });
        }

        throw error;
    }
}));

// ======================================================
// LOGIN
// ======================================================

app.post('/api/auth/login', asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            error: 'Email and password are required.'
        });
    }

    const cleanEmail = String(email).trim().toLowerCase();

    const [users] = await db.query(
        `SELECT
            id,
            full_name,
            email,
            password_hash,
            role,
            account_status
         FROM users
         WHERE email = ?
         LIMIT 1`,
        [cleanEmail]
    );

    if (
        !users.length ||
        !await bcrypt.compare(String(password), users[0].password_hash)
    ) {
        return res.status(401).json({
            error: 'Email or password is incorrect.'
        });
    }

    const user = users[0];

    if (user.role === 'guard' && user.account_status !== 'approved') {
        return res.status(403).json({
            error: user.account_status === 'pending'
                ? 'Your account is waiting for admin approval.'
                : 'Your guard application was rejected.'
        });
    }

    const token = jwt.sign(
        {
            id: user.id,
            name: user.full_name,
            email: user.email,
            role: user.role
        },
        JWT_SECRET,
        { expiresIn: '8h' }
    );

    res.json({
        token,
        user: {
            id: user.id,
            name: user.full_name,
            email: user.email,
            role: user.role
        }
    });
}));

// ======================================================
// CURRENT USER
// ======================================================

app.get('/api/me', auth, (req, res) => {
    res.json({
        user: req.user
    });
});
// ======================================================
// ADMIN: PENDING GUARD REQUESTS
// ======================================================

app.get(
    '/api/admin/guard-requests',
    auth,
    roles('admin'),
    asyncHandler(async (req, res) => {
        const [rows] = await db.query(
            `SELECT
                id,
                full_name AS name,
                email,
                phone,
                assigned_gate,
                account_status
             FROM users
             WHERE role = 'guard'
             AND account_status = 'pending'
             ORDER BY id DESC`
        );

        res.json(rows);
    })
);


// ======================================================
// ADMIN: APPROVE OR REJECT GUARD
// ======================================================

app.patch(
    '/api/admin/guard-requests/:id',
    auth,
    roles('admin'),
    asyncHandler(async (req, res) => {
        const guardId = Number(req.params.id);
        const { status } = req.body;

        if (!Number.isInteger(guardId) || guardId <= 0) {
            return res.status(400).json({
                error: 'Invalid guard ID.'
            });
        }

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({
                error: 'Status must be approved or rejected.'
            });
        }

        const [result] = await db.query(
            `UPDATE users
             SET account_status = ?
             WHERE id = ?
             AND role = 'guard'
             AND account_status = 'pending'`,
            [status, guardId]
        );

        if (!result.affectedRows) {
            return res.status(404).json({
                error: 'Pending guard application not found.'
            });
        }

        res.json({
            message: `Guard application ${status} successfully.`
        });
    })
);


// ======================================================
// ADMIN: VIEW APPROVED GUARDS
// ======================================================

app.get(
    '/api/admin/guards',
    auth,
    roles('admin'),
    asyncHandler(async (req, res) => {
        const [rows] = await db.query(
            `SELECT
                id,
                full_name AS name,
                email,
                phone,
                assigned_gate,
                account_status
             FROM users
             WHERE role = 'guard'
             AND account_status = 'approved'
             ORDER BY id DESC`
        );

        res.json(rows);
    })
);


// ======================================================
// DASHBOARD
// ======================================================

app.get('/api/dashboard', auth, asyncHandler(async (req, res) => {
    const isOwner = req.user.role === 'owner';

    let vehicleQuery = `
        SELECT COUNT(*) AS vehicles
        FROM vehicles
    `;

    const vehicleParams = [];

    if (isOwner) {
        vehicleQuery = `
            SELECT COUNT(v.id) AS vehicles
            FROM vehicles v
            JOIN vehicle_owners o ON o.id = v.owner_id
            WHERE o.user_id = ?
        `;

        vehicleParams.push(req.user.id);
    }

    const [[vehicleCount]] = await db.query(
        vehicleQuery,
        vehicleParams
    );

    const [[slotCount]] = await db.query(
        `SELECT COUNT(*) AS slots
         FROM parking_slots
         WHERE is_active = 1`
    );

    const [[occupiedCount]] = await db.query(
        `SELECT COUNT(DISTINCT ps.slot_id) AS occupied
         FROM parking_sessions ps
         JOIN parking_slots s ON s.id = ps.slot_id
         WHERE ps.status = 'active'
         AND s.is_active = 1`
    );

    let revenueQuery = `
        SELECT COALESCE(SUM(p.amount), 0) AS revenue
        FROM payments p
        JOIN parking_sessions ps ON ps.id = p.session_id
        JOIN vehicles v ON v.id = ps.vehicle_id
    `;

    const revenueParams = [];

    if (isOwner) {
        revenueQuery += `
            JOIN vehicle_owners o ON o.id = v.owner_id
            WHERE o.user_id = ?
            AND p.status = 'paid'
            AND DATE(p.paid_at) = CURDATE()
        `;

        revenueParams.push(req.user.id);
    } else {
        revenueQuery += `
            WHERE p.status = 'paid'
            AND DATE(p.paid_at) = CURDATE()
        `;
    }

    const [[revenueRow]] = await db.query(
        revenueQuery,
        revenueParams
    );

    const [zones] = await db.query(
        `SELECT
            z.id,
            z.name,
            z.hourly_rate,
            COUNT(s.id) AS total_slots,
            COUNT(DISTINCT CASE
                WHEN ps.id IS NOT NULL THEN s.id
                ELSE NULL
            END) AS occupied
         FROM parking_zones z
         LEFT JOIN parking_slots s
            ON s.zone_id = z.id
            AND s.is_active = 1
         LEFT JOIN parking_sessions ps
            ON ps.slot_id = s.id
            AND ps.status = 'active'
         GROUP BY z.id, z.name, z.hourly_rate
         ORDER BY z.id`
    );

    let recentQuery = `
        SELECT
            ps.id,
            v.plate_number,
            s.slot_code,
            z.name AS zone,
            ps.entry_time,
            ps.status
        FROM parking_sessions ps
        JOIN vehicles v ON v.id = ps.vehicle_id
        JOIN parking_slots s ON s.id = ps.slot_id
        JOIN parking_zones z ON z.id = s.zone_id
    `;

    const recentParams = [];

    if (isOwner) {
        recentQuery += `
            JOIN vehicle_owners o ON o.id = v.owner_id
            WHERE o.user_id = ?
        `;

        recentParams.push(req.user.id);
    }

    recentQuery += ' ORDER BY ps.id DESC LIMIT 6';

    const [recent] = await db.query(
        recentQuery,
        recentParams
    );

    const slots = Number(slotCount.slots || 0);
    const occupied = Number(occupiedCount.occupied || 0);

    res.json({
        stats: {
            vehicles: Number(vehicleCount.vehicles || 0),
            slots,
            occupied,
            available: Math.max(0, slots - occupied),
            revenue: Number(revenueRow.revenue || 0)
        },
        zones,
        recent
    });
}));


// ======================================================
// PARKING SLOTS
// ======================================================

app.get('/api/slots', auth, asyncHandler(async (req, res) => {
    const showPlate = ['admin', 'guard'].includes(req.user.role);

    const [rows] = await db.query(
        `SELECT
            s.id,
            s.slot_code,
            s.slot_type,
            s.is_active,
            z.name AS zone,
            z.id AS zone_id,
            z.hourly_rate,
            ps.id AS session_id,
            ${showPlate ? 'v.plate_number' : 'NULL AS plate_number'}
         FROM parking_slots s
         JOIN parking_zones z ON z.id = s.zone_id
         LEFT JOIN parking_sessions ps
            ON ps.slot_id = s.id
            AND ps.status = 'active'
         LEFT JOIN vehicles v ON v.id = ps.vehicle_id
         ORDER BY z.id, s.slot_code`
    );

    res.json(rows);
}));


// ======================================================
// VEHICLES: VIEW
// ======================================================

app.get('/api/vehicles', auth, asyncHandler(async (req, res) => {
    let query = `
        SELECT
            v.id,
            v.plate_number,
            v.vehicle_type,
            v.make_model,
            v.color,
            v.approval_status,
            u.full_name AS owner,
            u.email
        FROM vehicles v
        JOIN vehicle_owners o ON o.id = v.owner_id
        JOIN users u ON u.id = o.user_id
    `;

    const params = [];

    if (req.user.role === 'owner') {
        query += ' WHERE o.user_id = ?';
        params.push(req.user.id);
    }

    query += ' ORDER BY v.id DESC';

    const [rows] = await db.query(query, params);

    res.json(rows);
}));


// ======================================================
// VEHICLES: ADD
// OWNER VEHICLES NEED ADMIN APPROVAL
// ADMIN/GUARD ADDED VEHICLES ARE APPROVED
// ======================================================

app.post(
    '/api/vehicles',
    auth,
    roles('admin', 'guard', 'owner'),
    asyncHandler(async (req, res) => {
        const {
            plate_number,
            vehicle_type,
            make_model,
            color,
            owner_name,
            owner_email
        } = req.body;

        const plate = cleanPlate(plate_number);
        const type = vehicle_type || 'Car';

        if (!plate) {
            return res.status(400).json({
                error: 'Vehicle plate number is required.'
            });
        }

        if (plate.length > 30) {
            return res.status(400).json({
                error: 'Plate number cannot exceed 30 characters.'
            });
        }

        if (!validVehicleType(type)) {
            return res.status(400).json({
                error: 'Invalid vehicle type.'
            });
        }

        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            let ownerId;

            if (req.user.role === 'owner') {
                ownerId = await getOwnerId(connection, req.user.id);

                if (!ownerId) {
                    await connection.rollback();

                    return res.status(400).json({
                        error: 'Owner profile not found. Please contact Admin.'
                    });
                }
            } else {
                if (!owner_name || !owner_email) {
                    await connection.rollback();

                    return res.status(400).json({
                        error: 'Owner name and owner email are required.'
                    });
                }

                const cleanOwnerName = String(owner_name).trim();
                const cleanOwnerEmail = String(owner_email).trim().toLowerCase();

                if (!cleanOwnerName || !validEmail(cleanOwnerEmail)) {
                    await connection.rollback();

                    return res.status(400).json({
                        error: 'Enter a valid owner name and email.'
                    });
                }

                const [users] = await connection.query(
                    `SELECT id, full_name, role
                     FROM users
                     WHERE email = ?
                     LIMIT 1
                     FOR UPDATE`,
                    [cleanOwnerEmail]
                );

                let userId;

                if (users.length) {
                    if (users[0].role !== 'owner') {
                        await connection.rollback();

                        return res.status(400).json({
                            error: 'This email does not belong to an Owner account.'
                        });
                    }

                    userId = users[0].id;
                } else {
                    const temporaryHash = await bcrypt.hash(
                        crypto.randomBytes(32).toString('hex'),
                        12
                    );

                    const [newUser] = await connection.query(
                        `INSERT INTO users
                            (full_name, email, password_hash, role)
                         VALUES (?, ?, ?, 'owner')`,
                        [
                            cleanOwnerName,
                            cleanOwnerEmail,
                            temporaryHash
                        ]
                    );

                    userId = newUser.insertId;
                }

                let [ownerRows] = await connection.query(
                    'SELECT id FROM vehicle_owners WHERE user_id = ?',
                    [userId]
                );

                if (!ownerRows.length) {
                    await connection.query(
                        'INSERT INTO vehicle_owners (user_id) VALUES (?)',
                        [userId]
                    );

                    const [newOwnerRows] = await connection.query(
                        'SELECT id FROM vehicle_owners WHERE user_id = ?',
                        [userId]
                    );

                    ownerRows = newOwnerRows;
                }

                ownerId = ownerRows[0].id;
            }

            const approvalStatus =
                req.user.role === 'owner' ? 'pending' : 'approved';

            const [vehicleResult] = await connection.query(
                `INSERT INTO vehicles
                    (
                        owner_id,
                        plate_number,
                        vehicle_type,
                        make_model,
                        color,
                        approval_status
                    )
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    ownerId,
                    plate,
                    type,
                    make_model ? String(make_model).trim() : null,
                    color ? String(color).trim() : null,
                    approvalStatus
                ]
            );

            await connection.commit();

            res.status(201).json({
                success: true,
                id: vehicleResult.insertId,
                approval_status: approvalStatus,
                message: req.user.role === 'owner'
                    ? 'Vehicle registered successfully. Please wait for Admin approval.'
                    : 'Vehicle registered successfully.'
            });

        } catch (error) {
            await rollbackQuietly(connection);

            if (error.code === 'ER_DUP_ENTRY') {
                return res.status(409).json({
                    error: 'This plate number is already registered.'
                });
            }

            throw error;

        } finally {
            connection.release();
        }
    })
);


// ======================================================
// ADMIN: APPROVE OR REJECT VEHICLE
// ======================================================

app.patch(
    '/api/admin/vehicles/:id/approval',
    auth,
    roles('admin'),
    asyncHandler(async (req, res) => {
        const vehicleId = Number(req.params.id);
        const { status } = req.body;

        if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
            return res.status(400).json({
                error: 'Invalid vehicle ID.'
            });
        }

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({
                error: 'Status must be approved or rejected.'
            });
        }

        const [result] = await db.query(
            `UPDATE vehicles
             SET approval_status = ?
             WHERE id = ?
             AND approval_status = 'pending'`,
            [status, vehicleId]
        );

        if (!result.affectedRows) {
            return res.status(404).json({
                error: 'Pending vehicle not found.'
            });
        }

        res.json({
            success: true,
            message: `Vehicle ${status} successfully.`
        });
    })
);


// ======================================================
// VEHICLES: DELETE - ADMIN ONLY
// ======================================================

app.delete(
    '/api/vehicles/:id',
    auth,
    roles('admin'),
    asyncHandler(async (req, res) => {
        const vehicleId = Number(req.params.id);

        if (!Number.isInteger(vehicleId) || vehicleId <= 0) {
            return res.status(400).json({
                error: 'Invalid vehicle ID.'
            });
        }

        const [active] = await db.query(
            `SELECT id
             FROM parking_sessions
             WHERE vehicle_id = ?
             AND status = 'active'
             LIMIT 1`,
            [vehicleId]
        );

        if (active.length) {
            return res.status(409).json({
                error: 'Exit or release the vehicle before deleting it.'
            });
        }

        const [result] = await db.query(
            'DELETE FROM vehicles WHERE id = ?',
            [vehicleId]
        );

        if (!result.affectedRows) {
            return res.status(404).json({
                error: 'Vehicle not found.'
            });
        }

        res.json({
            message: 'Vehicle removed successfully.'
        });
    })
);
// ======================================================
// VEHICLE ENTRY - ADMIN/GUARD
// ======================================================

app.post(
    '/api/sessions/entry',
    auth,
    roles('admin', 'guard'),
    asyncHandler(async (req, res) => {
        const { plate_number, slot_id } = req.body;
        const plate = cleanPlate(plate_number);
        const slotId = Number(slot_id);

        if (!plate || !Number.isInteger(slotId) || slotId <= 0) {
            return res.status(400).json({
                error: 'Valid plate number and parking slot are required.'
            });
        }

        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            const [vehicles] = await connection.query(
                `SELECT id, vehicle_type, approval_status
                 FROM vehicles
                 WHERE plate_number = ?
                 FOR UPDATE`,
                [plate]
            );

            if (!vehicles.length) {
                await connection.rollback();
                return res.status(404).json({
                    error: 'Vehicle not found. Register it first.'
                });
            }

            const vehicle = vehicles[0];

            if (vehicle.approval_status !== 'approved') {
                await connection.rollback();
                return res.status(403).json({
                    error: 'This vehicle has not been approved by Admin.'
                });
            }

            const [slots] = await connection.query(
                `SELECT id, slot_type
                 FROM parking_slots
                 WHERE id = ?
                 AND is_active = 1
                 FOR UPDATE`,
                [slotId]
            );

            if (!slots.length) {
                await connection.rollback();
                return res.status(404).json({
                    error: 'Parking slot not found or inactive.'
                });
            }

            const slot = slots[0];

            if (
                slot.slot_type !== 'Any' &&
                slot.slot_type !== vehicle.vehicle_type
            ) {
                await connection.rollback();
                return res.status(400).json({
                    error: 'This slot is not suitable for that vehicle type.'
                });
            }

            const [activeVehicle] = await connection.query(
                `SELECT id
                 FROM parking_sessions
                 WHERE vehicle_id = ?
                 AND status = 'active'
                 LIMIT 1`,
                [vehicle.id]
            );

            if (activeVehicle.length) {
                await connection.rollback();
                return res.status(409).json({
                    error: 'This vehicle is already parked.'
                });
            }

            const [occupiedSlots] = await connection.query(
                `SELECT id
                 FROM parking_sessions
                 WHERE slot_id = ?
                 AND status = 'active'
                 LIMIT 1`,
                [slotId]
            );

            if (occupiedSlots.length) {
                await connection.rollback();
                return res.status(409).json({
                    error: 'This parking slot is already occupied.'
                });
            }

            const [result] = await connection.query(
                `INSERT INTO parking_sessions
                    (vehicle_id, slot_id, created_by, status, fee)
                 VALUES (?, ?, ?, 'active', 0.00)`,
                [vehicle.id, slot.id, req.user.id]
            );

            await connection.commit();

            res.status(201).json({
                id: result.insertId,
                message: 'Vehicle entry recorded successfully.'
            });

        } catch (error) {
            await rollbackQuietly(connection);
            throw error;
        } finally {
            connection.release();
        }
    })
);


// ======================================================
// VEHICLE EXIT - ADMIN/GUARD
// ======================================================

app.post(
    '/api/sessions/:id/exit',
    auth,
    roles('admin', 'guard'),
    asyncHandler(async (req, res) => {
        const sessionId = Number(req.params.id);

        if (!Number.isInteger(sessionId) || sessionId <= 0) {
            return res.status(400).json({
                error: 'Invalid session ID.'
            });
        }

        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            const [sessions] = await connection.query(
                `SELECT
                    ps.id,
                    ps.entry_time,
                    z.hourly_rate
                 FROM parking_sessions ps
                 JOIN parking_slots s ON s.id = ps.slot_id
                 JOIN parking_zones z ON z.id = s.zone_id
                 WHERE ps.id = ?
                 AND ps.status = 'active'
                 FOR UPDATE`,
                [sessionId]
            );

            if (!sessions.length) {
                await connection.rollback();
                return res.status(404).json({
                    error: 'Active parking session not found.'
                });
            }

            const session = sessions[0];

            const [[durationRow]] = await connection.query(
                `SELECT GREATEST(
                    1,
                    TIMESTAMPDIFF(MINUTE, ?, NOW())
                 ) AS minutes`,
                [session.entry_time]
            );

            const minutes = Number(durationRow.minutes);
            const hourlyRate = Number(session.hourly_rate);

            if (!Number.isFinite(hourlyRate) || hourlyRate < 0) {
                await connection.rollback();
                return res.status(500).json({
                    error: 'Invalid hourly parking rate.'
                });
            }

            const fee = Math.max(
                hourlyRate,
                Math.ceil(minutes / 60) * hourlyRate
            );

            await connection.query(
                `UPDATE parking_sessions
                 SET exit_time = NOW(),
                     duration_minutes = ?,
                     fee = ?,
                     status = 'completed'
                 WHERE id = ?`,
                [minutes, fee, sessionId]
            );

            const method = ['cash', 'card', 'online'].includes(req.body.method)
                ? req.body.method
                : 'cash';

            await connection.query(
                `INSERT INTO payments
                    (session_id, amount, method, status, received_by)
                 VALUES (?, ?, ?, 'paid', ?)`,
                [sessionId, fee, method, req.user.id]
            );

            await connection.commit();

            res.json({
                success: true,
                message: 'Exit recorded and payment saved.',
                duration_minutes: minutes,
                fee
            });

        } catch (error) {
            await rollbackQuietly(connection);
            throw error;
        } finally {
            connection.release();
        }
    })
);


// ======================================================
// OWNER: BOOK PARKING SLOT
// ======================================================

app.post(
    '/api/owner/bookings',
    auth,
    roles('owner'),
    asyncHandler(async (req, res) => {
        const vehicleId = Number(req.body.vehicle_id);
        const slotId = Number(req.body.slot_id);

        if (
            !Number.isInteger(vehicleId) ||
            vehicleId <= 0 ||
            !Number.isInteger(slotId) ||
            slotId <= 0
        ) {
            return res.status(400).json({
                error: 'Please select a valid vehicle and parking slot.'
            });
        }

        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            const [owners] = await connection.query(
                `SELECT id
                 FROM vehicle_owners
                 WHERE user_id = ?
                 FOR UPDATE`,
                [req.user.id]
            );

            if (!owners.length) {
                await connection.rollback();
                return res.status(404).json({
                    error: 'Owner profile not found.'
                });
            }

            const ownerId = owners[0].id;

            const [vehicles] = await connection.query(
                `SELECT id, vehicle_type, approval_status
                 FROM vehicles
                 WHERE id = ?
                 AND owner_id = ?
                 FOR UPDATE`,
                [vehicleId, ownerId]
            );

            if (!vehicles.length) {
                await connection.rollback();
                return res.status(403).json({
                    error: 'This vehicle does not belong to your account.'
                });
            }

            const vehicle = vehicles[0];

            if (vehicle.approval_status !== 'approved') {
                await connection.rollback();
                return res.status(403).json({
                    error: 'Your vehicle must be approved by Admin before booking.'
                });
            }

            const [activeBookings] = await connection.query(
                `SELECT ps.id
                 FROM parking_sessions ps
                 JOIN vehicles v ON v.id = ps.vehicle_id
                 WHERE v.owner_id = ?
                 AND ps.status = 'active'
                 LIMIT 1`,
                [ownerId]
            );

            if (activeBookings.length) {
                await connection.rollback();
                return res.status(409).json({
                    error: 'You already have an active parking booking.'
                });
            }

            const [slots] = await connection.query(
                `SELECT id, slot_type
                 FROM parking_slots
                 WHERE id = ?
                 AND is_active = 1
                 FOR UPDATE`,
                [slotId]
            );

            if (!slots.length) {
                await connection.rollback();
                return res.status(404).json({
                    error: 'Selected parking slot is not available.'
                });
            }

            const slot = slots[0];

            if (
                slot.slot_type !== 'Any' &&
                slot.slot_type !== vehicle.vehicle_type
            ) {
                await connection.rollback();
                return res.status(400).json({
                    error: 'This parking slot is not suitable for your vehicle.'
                });
            }

            const [occupied] = await connection.query(
                `SELECT id
                 FROM parking_sessions
                 WHERE slot_id = ?
                 AND status = 'active'
                 LIMIT 1`,
                [slotId]
            );

            if (occupied.length) {
                await connection.rollback();
                return res.status(409).json({
                    error: 'This parking slot is already occupied.'
                });
            }

            const [result] = await connection.query(
                `INSERT INTO parking_sessions
                    (vehicle_id, slot_id, created_by, status, fee)
                 VALUES (?, ?, ?, 'active', 0.00)`,
                [vehicleId, slotId, req.user.id]
            );

            await connection.commit();

            res.status(201).json({
                success: true,
                id: result.insertId,
                message: 'Parking slot successfully booked.'
            });

        } catch (error) {
            await rollbackQuietly(connection);
            throw error;
        } finally {
            connection.release();
        }
    })
);


// ======================================================
// OWNER: RELEASE BOOKING
// ======================================================

app.post(
    '/api/owner/bookings/:id/release',
    auth,
    roles('owner'),
    asyncHandler(async (req, res) => {
        const bookingId = Number(req.params.id);

        if (!Number.isInteger(bookingId) || bookingId <= 0) {
            return res.status(400).json({
                error: 'Invalid booking ID.'
            });
        }

        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            const [bookings] = await connection.query(
                `SELECT ps.id
                 FROM parking_sessions ps
                 JOIN vehicles v ON v.id = ps.vehicle_id
                 JOIN vehicle_owners o ON o.id = v.owner_id
                 WHERE ps.id = ?
                 AND o.user_id = ?
                 AND ps.status = 'active'
                 FOR UPDATE`,
                [bookingId, req.user.id]
            );

            if (!bookings.length) {
                await connection.rollback();
                return res.status(404).json({
                    error: 'Your active booking was not found.'
                });
            }

            await connection.query(
                `UPDATE parking_sessions
                 SET exit_time = NOW(),
                     duration_minutes = 0,
                     fee = 0.00,
                     status = 'completed'
                 WHERE id = ?`,
                [bookingId]
            );

            await connection.commit();

            res.json({
                success: true,
                message: 'Parking slot successfully released.'
            });

        } catch (error) {
            await rollbackQuietly(connection);
            throw error;
        } finally {
            connection.release();
        }
    })
);
// ======================================================
// PARKING HISTORY
// ======================================================

app.get('/api/sessions', auth, asyncHandler(async (req, res) => {
    let query = `
        SELECT
            ps.id,
            v.plate_number,
            v.vehicle_type,
            s.slot_code,
            z.name AS zone,
            ps.entry_time,
            ps.exit_time,
            ps.duration_minutes,
            ps.fee,
            ps.status
        FROM parking_sessions ps
        JOIN vehicles v ON v.id = ps.vehicle_id
        JOIN parking_slots s ON s.id = ps.slot_id
        JOIN parking_zones z ON z.id = s.zone_id
    `;

    const params = [];

    if (req.user.role === 'owner') {
        query += `
            JOIN vehicle_owners o ON o.id = v.owner_id
            WHERE o.user_id = ?
        `;

        params.push(req.user.id);
    }

    query += ' ORDER BY ps.id DESC LIMIT 100';

    const [rows] = await db.query(query, params);

    res.json(rows);
}));


// ======================================================
// PAYMENTS
// ======================================================

app.get('/api/payments', auth, asyncHandler(async (req, res) => {
    let query = `
        SELECT
            p.id,
            p.amount,
            p.method,
            p.status,
            p.paid_at,
            v.plate_number,
            ps.id AS session_id
        FROM payments p
        JOIN parking_sessions ps ON ps.id = p.session_id
        JOIN vehicles v ON v.id = ps.vehicle_id
    `;

    const params = [];

    if (req.user.role === 'owner') {
        query += `
            JOIN vehicle_owners o ON o.id = v.owner_id
            WHERE o.user_id = ?
        `;

        params.push(req.user.id);
    }

    query += ' ORDER BY p.id DESC LIMIT 100';

    const [rows] = await db.query(query, params);

    res.json(rows);
}));


// ======================================================
// VIOLATIONS: VIEW
// ======================================================

app.get('/api/violations', auth, asyncHandler(async (req, res) => {
    let query = `
        SELECT
            vi.id,
            vi.description,
            vi.fine_amount,
            vi.status,
            vi.recorded_at,
            v.plate_number,
            s.slot_code
        FROM violations vi
        JOIN vehicles v ON v.id = vi.vehicle_id
        LEFT JOIN parking_slots s ON s.id = vi.slot_id
    `;

    const params = [];

    if (req.user.role === 'owner') {
        query += `
            JOIN vehicle_owners o ON o.id = v.owner_id
            WHERE o.user_id = ?
        `;

        params.push(req.user.id);
    }

    query += ' ORDER BY vi.id DESC LIMIT 100';

    const [rows] = await db.query(query, params);

    res.json(rows);
}));


// ======================================================
// VIOLATIONS: ADD - ADMIN/GUARD
// ======================================================

app.post(
    '/api/violations',
    auth,
    roles('admin', 'guard'),
    asyncHandler(async (req, res) => {
        const {
            plate_number,
            slot_id,
            description,
            fine_amount
        } = req.body;

        const plate = cleanPlate(plate_number);
        const cleanDescription = String(description || '').trim();
        const fine = Number(fine_amount || 0);

        if (!plate || !cleanDescription) {
            return res.status(400).json({
                error: 'Plate number and description are required.'
            });
        }

        if (!Number.isFinite(fine) || fine < 0) {
            return res.status(400).json({
                error: 'Enter a valid fine amount.'
            });
        }

        const [vehicles] = await db.query(
            'SELECT id FROM vehicles WHERE plate_number = ? LIMIT 1',
            [plate]
        );

        if (!vehicles.length) {
            return res.status(404).json({
                error: 'Vehicle not found.'
            });
        }

        let slotId = null;

        if (slot_id !== undefined && slot_id !== null && slot_id !== '') {
            slotId = Number(slot_id);

            if (!Number.isInteger(slotId) || slotId <= 0) {
                return res.status(400).json({
                    error: 'Invalid parking slot.'
                });
            }

            const [slots] = await db.query(
                'SELECT id FROM parking_slots WHERE id = ?',
                [slotId]
            );

            if (!slots.length) {
                return res.status(404).json({
                    error: 'Parking slot not found.'
                });
            }
        }

        await db.query(
            `INSERT INTO violations
                (vehicle_id, slot_id, description, fine_amount, recorded_by)
             VALUES (?, ?, ?, ?, ?)`,
            [
                vehicles[0].id,
                slotId,
                cleanDescription,
                fine,
                req.user.id
            ]
        );

        res.status(201).json({
            message: 'Violation recorded successfully.'
        });
    })
);


// ======================================================
// REPORTS - ADMIN ONLY
// ======================================================

app.get(
    '/api/reports',
    auth,
    roles('admin'),
    asyncHandler(async (req, res) => {
        const [daily] = await db.query(
            `SELECT
                DATE(paid_at) AS day,
                COALESCE(SUM(amount), 0) AS revenue,
                COUNT(*) AS payments
             FROM payments
             WHERE status = 'paid'
             AND paid_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
             GROUP BY DATE(paid_at)
             ORDER BY day`
        );

        const [zones] = await db.query(
            `SELECT
                z.name,
                COUNT(ps.id) AS sessions,
                COALESCE(SUM(ps.fee), 0) AS revenue
             FROM parking_zones z
             LEFT JOIN parking_slots s ON s.zone_id = z.id
             LEFT JOIN parking_sessions ps
                ON ps.slot_id = s.id
                AND ps.status = 'completed'
             GROUP BY z.id, z.name
             ORDER BY revenue DESC`
        );

        res.json({
            daily,
            zones
        });
    })
);


// ======================================================
// UNKNOWN API ROUTE
// ======================================================

app.use('/api', (req, res) => {
    res.status(404).json({
        error: 'API route not found.'
    });
});


// ======================================================
// FRONTEND ROUTE
// ======================================================

app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith('/api/')) {
        return next();
    }

    res.sendFile(
        path.join(__dirname, '..', 'public', 'index.html')
    );
});


// ======================================================
// GENERAL ERROR HANDLER
// ======================================================

app.use((error, req, res, next) => {
    console.error('Server error:', error);

    if (res.headersSent) {
        return next(error);
    }

    res.status(500).json({
        error: 'Internal server error.'
    });
});


// ======================================================
// START SERVER
// ======================================================

app.listen(PORT, () => {
    console.log(`ParkNest running at http://localhost:${PORT}`);
});