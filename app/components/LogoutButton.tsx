import { logoutAction } from "@/app/login/actions";

export default function LogoutButton() {
    return (
        <form action={logoutAction}>
            <button
                type="submit"
                style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid #d1d5db",
                    background: "transparent",
                    fontWeight: 900,
                    cursor: "pointer",
                }}
            >
                Logout
            </button>
        </form>
    );
}
