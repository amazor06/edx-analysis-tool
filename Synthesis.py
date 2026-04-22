# Atomic masses (g/mol)
M_Fe = 55.845
M_Nb = 92.906
M_S  = 32.06

# --- User Inputs ---
x = float(input("Enter Fe concentration x in Fe_xNbS2 (ex: 0.25): "))
total_mass = float(input("Enter desired total sample mass (g): "))

# --- Molar mass of compound ---
molar_mass = x*M_Fe + M_Nb + 2*M_S

# --- Mass fractions ---
fraction_Fe = (x*M_Fe) / molar_mass
fraction_Nb = M_Nb / molar_mass
fraction_S  = (2*M_S) / molar_mass

# --- Grams needed ---
grams_Fe = fraction_Fe * total_mass
grams_Nb = fraction_Nb * total_mass
grams_S  = fraction_S  * total_mass

# --- Output ---
print("\nMasses to weigh:")
print(f"Fe : {grams_Fe:.4f} g")
print(f"Nb : {grams_Nb:.4f} g")
print(f"S  : {grams_S:.4f} g")

print(f"\nCheck total: {grams_Fe + grams_Nb + grams_S:.4f} g")